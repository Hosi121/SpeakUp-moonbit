///|
priv enum CallConnection {
  Connecting
  Waiting
  Connected
}

///|
fn CallConnection::label(self : Self) -> String {
  match self {
    Connecting => "connecting"
    Waiting => "waiting"
    Connected => "connected"
  }
}

///|
priv struct CallObserver {
  conversation : (@shared.Call) -> Unit
  connection : (CallConnection) -> Unit
  error : (String) -> Unit
  speaking : (Bool, Bool) -> Unit
}

///|
priv struct RemoteAudio {
  life : @lifetime.Lifetime
  meter : MeterPort
}

///|
priv enum RemoteDescription {
  Awaiting(Array[IceCandidate])
  Installed
}

///|
priv enum Negotiation {
  CreateOffer
  SetRemote(DescriptionKind, String)
  AddIce(IceCandidate)
}

///|
/// Each start allocates a fresh attempt. A closed attempt is never reused.
priv struct Voice {
  id : Int
  life : @lifetime.Lifetime
  media : MediaPorts
  observer : CallObserver
  inbox : @browser_async.Inbox[Negotiation]
  mut socket : SocketPort?
  mut input : AudioInput?
  mut remote : RemoteAudio?
  mut muted : Bool
}

///|
fn Voice::fail(self : Self, message : String) -> Unit {
  if self.life.is_open() {
    self.life.close()
    (self.observer.error)(message)
  }
}

///|
fn Voice::send(self : Self, value : Json) -> Unit {
  if !self.life.is_open() {
    return
  }
  let sent = if self.socket is Some(socket) {
    @browser_async.guard_sync(fn() { (socket.send)(value.stringify()) }) catch {
      _ => false
    }
  } else {
    false
  }
  if !sent {
    self.fail("通話サーバに接続していません")
  }
}

///|
fn Voice::attach_remote(self : Self, stream : StreamPort) -> Unit raise {
  let life = self.life.child()
  ignore(life.own(stream.close))
  @browser_async.check(life)
  if self.remote is Some(previous) {
    previous.life.close()
  }
  self.remote = None
  let meter = @browser_async.guard_sync(fn() { (stream.meter)(256) })
  ignore(life.own(meter.close))
  @browser_async.check(life)
  let detach = @browser_async.guard_sync(fn() {
    (stream.play)(fn(message) {
      if life.is_open() {
        (self.observer.error)(message)
      }
    })
  })
  ignore(life.own(detach))
  @browser_async.check(life)
  self.remote = Some({ life, meter, })
}

///|
async fn Voice::describe(
  self : Self,
  peer : PeerPort,
  kind : DescriptionKind,
) -> Unit {
  let sdp = peer.describe_async(self.life, kind)
  let installed = peer.local_async(self.life, kind, sdp)
  let description : Json = {
    "type": kind.label().to_json(),
    "sdp": installed.to_json(),
  }
  self.send(
    match kind {
      Offer => { "type": "offer", "offer": description }
      Answer => { "type": "answer", "answer": description }
    },
  )
}

///|
async fn Voice::receive(self : Self, peer : PeerPort) -> Unit {
  let mut description : RemoteDescription = Awaiting([])
  while self.life.is_open() {
    match self.inbox.next() {
      CreateOffer => self.describe(peer, Offer)
      SetRemote(kind, sdp) => {
        peer.remote_async(self.life, kind, sdp)
        let pending = match description {
          Awaiting(pending) => pending
          Installed => []
        }
        description = Installed
        for candidate in pending {
          peer.ice_async(self.life, candidate)
        }
        if kind is Offer {
          self.describe(peer, Answer)
        }
      }
      AddIce(candidate) =>
        match description {
          Installed => peer.ice_async(self.life, candidate)
          Awaiting(pending) =>
            if pending.length() >= 128 {
              raise @browser_async.PortError("ICE が多すぎます")
            } else {
              pending.push(candidate)
            }
        }
    }
  }
}

///|
/// Call state and termination must not wait behind a suspended WebRTC method.
fn Voice::signal(self : Self, signal : @shared.ServerSignal) -> Unit {
  let command = match signal {
    Conversation(call) => {
      if call.model.id() != self.id {
        self.fail("別の通話の状態を受信しました")
        return
      }
      (self.observer.conversation)(call)
      if !call.model.can_join() {
        self.life.close()
      }
      return
    }
    Waiting => {
      (self.observer.connection)(Waiting)
      return
    }
    Assigned(role) => {
      (self.observer.connection)(Connecting)
      match role {
        Offerer => CreateOffer
        Answerer => return
      }
    }
    Peer(Offer(sdp)) => SetRemote(Offer, sdp)
    Peer(Answer(sdp)) => SetRemote(Answer, sdp)
    Peer(Ice(value)) => AddIce(candidate_port(value))
    PeerLeft => {
      self.fail("相手が通話から退出しました")
      return
    }
    Failure(message) => {
      self.fail(message)
      return
    }
  }
  if self.life.is_open() && !self.inbox.offer(command) {
    self.fail("通話メッセージが多すぎます")
  }
}

///|
async fn Voice::sample(self : Self) -> Unit {
  while self.life.is_open() {
    let speaking = match self.input {
      Some(audio) => !self.muted && audio.meter.speaking()
      None => false
    }
    let remote = match self.remote {
      Some(audio) => audio.meter.speaking()
      None => false
    }
    (self.observer.speaking)(speaking, remote)
    @browser_async.wait(self.life, fn(done) {
      (self.media.frame)(fn() { done(Ok(())) })
    })
  }
}

///|
async fn Voice::connect(
  self : Self,
  ports : AppPorts,
  realtime : RealtimePorts,
  group : @async.TaskGroup[Unit],
) -> Unit {
  @browser_async.check(self.life)
  (self.observer.connection)(Connecting)
  let call = @shared.parse_call(
    read_voice(ports, self.life, "/conversations/\{self.id}"),
  )
  if call.model.id() != self.id {
    raise @browser_async.PortError("別の通話の状態を受信しました")
  }
  (self.observer.conversation)(call)
  if !call.model.can_join() {
    return
  }
  let servers = @shared.checked_ice_servers(
    read_voice(ports, self.life, "/rtc-config"),
  )
  let stream = @browser_async.acquire(
    self.life,
    fn(done) {
      (self.media.acquire)(fn(stream) { done(Ok(stream)) }, fn(error) {
        done(Err(@browser_async.PortError(error)))
      })
      noop
    },
    release=fn(stream) { (stream.close)() },
  )
  @browser_async.guard_sync(fn() { (stream.mute)(self.muted) })
  @browser_async.check(self.life)
  let meter = @browser_async.guard_sync(fn() { (stream.meter)(256) })
  ignore(self.life.own(meter.close))
  @browser_async.check(self.life)
  self.input = Some({ stream, meter, })
  let peer = @browser_async.guard_sync(fn() {
    (stream.peer)(
      servers,
      fn(candidate) { self.send(ice_payload(candidate)) },
      fn(remote) {
        self.attach_remote(remote) catch {
          @browser_async.Stopped => ()
          _ => self.fail("通話が切断されました")
        }
      },
      fn(connection) {
        if !self.life.is_open() {
          return
        }
        match connection {
          "failed" => self.fail("通話が切断されました")
          "connected" => {
            (self.observer.connection)(Connected)
            self.send({ "type": "media-ready" })
          }
          _ => ()
        }
      },
    )
  })
  ignore(self.life.own(peer.close))
  @browser_async.check(self.life)
  let socket = @browser_async.guard_sync(fn() {
    (realtime.socket)("/ws", fn(kind, text) {
      if !self.life.is_open() {
        return
      }
      match kind {
        "open" =>
          self.send({
            "type": "Authorization",
            "token": ("Bearer " + (ports.token)()).to_json(),
            "room": self.id.to_json(),
          })
        "text" => {
          guard @shared.parse_server_signal(text) is Some(message) else {
            self.fail("不正な通話メッセージです")
          }
          self.signal(message)
        }
        "close" => self.fail("通話サーバとの接続が終了しました")
        "error" => self.fail("通話サーバに接続できませんでした")
        _ => self.fail("不正な通話メッセージです")
      }
    })
  })
  ignore(self.life.own(socket.close))
  @browser_async.check(self.life)
  self.socket = Some(socket)
  group.spawn_bg(async fn() { self.sample() })
  self.receive(peer)
  group.return_immediately(())
}

///|
fn create_call_voice(
  ports : AppPorts,
  realtime : RealtimePorts,
  media : MediaPorts,
  id : Int,
  observer : CallObserver,
) -> VoiceController {
  let current : Ref[Voice?] = Ref(None)
  let muted = Ref(false)
  {
    stop: fn() {
      let previous = current.val
      current.val = None
      if previous is Some(voice) {
        voice.life.close()
      }
    },
    mute: fn(value) {
      muted.val = value
      if current.val is Some(voice) && voice.life.is_open() {
        voice.muted = value
        if voice.input is Some(audio) {
          (audio.stream.mute)(value)
        }
      }
    },
    start: fn() {
      if id <= 0 || current.val.map(fn(v) { v.life.is_open() }).unwrap_or(false) {
        return
      }
      let life = @lifetime.Lifetime()
      let voice : Voice = {
        id,
        life,
        media,
        observer,
        inbox: @browser_async.Inbox(life, limit=256),
        socket: None,
        input: None,
        remote: None,
        muted: muted.val,
      }
      current.val = Some(voice)
      ignore(life.own(fn() { (observer.speaking)(false, false) }))
      @browser_async.run(
        life,
        async fn(group) { voice.connect(ports, realtime, group) },
        fn(error) {
          (observer.error)(
            match error {
              @browser_async.PortError(message) => message
              _ => "通話を開始・継続できませんでした"
            },
          )
        },
      )
    },
  }
}

///|
/// Concrete JS façade; the native backend shares the call model and protocol.
pub fn create_voice(
  ports : AppPorts,
  realtime : RealtimePorts,
  media : MediaPorts,
  id : Int,
  observer : VoiceObserver,
) -> VoiceController {
  create_call_voice(ports, realtime, media, id, {
    conversation: fn(call) { (observer.conversation)(call.dto()) },
    connection: fn(value) { (observer.connection)(value.label()) },
    error: observer.error,
    speaking: observer.speaking,
  })
}
