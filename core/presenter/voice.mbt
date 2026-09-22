///|
pub(all) struct IceCandidate {
  candidate : String
  mid : String
  has_mid : Bool
  line : Int
  username : String
  has_username : Bool
}

///|
pub(all) struct MeterPort {
  sample : () -> Array[Double]
  close : () -> Unit
}

///|
pub(all) struct PeerPort {
  describe : (Bool, (String, String) -> Unit) -> Unit
  set_local : (String, String, (String, String) -> Unit) -> Unit
  remote : (String, String, (String) -> Unit) -> Unit
  ice : (IceCandidate, (String) -> Unit) -> Unit
  close : () -> Unit
}

///|
pub(all) struct StreamPort {
  close : () -> Unit
  mute : (Bool) -> Unit
  meter : (Int) -> MeterPort
  play : ((String) -> Unit) -> () -> Unit
  peer : (
    Array[@shared.IceServerDto],
    (IceCandidate) -> Unit,
    (StreamPort) -> Unit,
    (String) -> Unit,
  ) -> PeerPort
}

///|
pub(all) struct MediaPorts {
  acquire : ((StreamPort) -> Unit, (String) -> Unit) -> Unit
  frame : (() -> Unit) -> () -> Unit
}

///|
pub(all) struct VoiceObserver {
  conversation : (@shared.ConversationDto) -> Unit
  connection : (String) -> Unit
  error : (String) -> Unit
  speaking : (Bool, Bool) -> Unit
}

///|
pub(all) struct VoiceController {
  start : () -> Unit
  stop : () -> Unit
  mute : (Bool) -> Unit
}

///|
priv enum Signal {
  Conversation(@shared.ConversationDto)
  Waiting
  Offerer(Bool)
  Description(String, String)
  Candidate(IceCandidate)
  Failure(String)
}

///|
fn optional_text(value : Json, key : String) -> (Bool, String) raise {
  guard value is Object(fields) else { fail("不正な ICE です") }
  match fields.get(key) {
    None | Some(Null) => (false, "")
    Some(String(text)) => (true, text)
    _ => fail("不正な ICE です")
  }
}

///|
fn signal(text : String) -> Signal raise {
  guard text.length() <= 65536 else {
    fail("不正な通話メッセージです")
  }
  match @json.parse(text) {
    { "type": "conversation", "value": value, .. } =>
      Conversation(@shared.decode_conversation_value(value))
    { "type": "waiting", .. } => Waiting
    { "type": "callType", "isOffer": True, .. } => Offerer(true)
    { "type": "callType", .. } => Offerer(false)
    {
      "type": "offer",
      "offer": { "type": "offer", "sdp": String(sdp), .. },
      ..
    } => {
      guard !sdp.is_empty() && sdp.length() <= 60000 else {
        fail("不正な SDP です")
      }
      Description("offer", sdp)
    }
    {
      "type": "answer",
      "answer": { "type": "answer", "sdp": String(sdp), .. },
      ..
    } => {
      guard !sdp.is_empty() && sdp.length() <= 60000 else {
        fail("不正な SDP です")
      }
      Description("answer", sdp)
    }
    {
      "type": "ice-candidate",
      "candidate": { "candidate": String(candidate), .. } as value,
      ..
    } => {
      guard candidate.length() <= 4096 else { fail("不正な ICE です") }
      let (has_mid, mid) = optional_text(value, "sdpMid")
      let (has_username, username) = optional_text(value, "usernameFragment")
      let line = match value {
        { "sdpMLineIndex": Number(n, ..), .. } => {
          guard n >= 0 && n <= 65535 && n == n.to_int().to_double() else {
            fail("不正な ICE です")
          }
          n.to_int()
        }
        Object(fields) => {
          guard fields.get("sdpMLineIndex") is (None | Some(Null)) else {
            fail("不正な ICE です")
          }
          -1
        }
        _ => -1
      }
      Candidate({ candidate, mid, has_mid, line, username, has_username, })
    }
    { "type": "peer-left", .. } =>
      Failure("相手が通話から退出しました")
    { "type": "error", "error": String(message), .. } => Failure(message)
    _ => Failure("不正な通話メッセージです")
  }
}

///|
priv struct Voice {
  id : Int
  life : Scope
  media : MediaPorts
  observer : VoiceObserver
  mut generation : Int
  mut socket : SocketPort?
  mut peer : PeerPort?
  mut local_stream : StreamPort?
  mut remote : StreamPort?
  mut local_meter : MeterPort?
  mut remote_meter : MeterPort?
  mut detach : () -> Unit
  mut frame : () -> Unit
  mut muted : Bool
  mut reading : Bool
  mut has_remote : Bool
  queue : Array[Signal]
  pending : Array[IceCandidate]
}

///|
fn Voice::stop(self : Self) -> Unit {
  self.life.stop()
  self.generation += 1
  (self.frame)()
  self.frame = noop
  (self.detach)()
  self.detach = noop
  if self.socket is Some(socket) {
    (socket.close)()
  }
  self.socket = None
  if self.peer is Some(peer) {
    (peer.close)()
  }
  self.peer = None
  if self.local_stream is Some(stream) {
    (stream.close)()
  }
  self.local_stream = None
  if self.remote is Some(stream) {
    (stream.close)()
  }
  self.remote = None
  if self.local_meter is Some(meter) {
    (meter.close)()
  }
  self.local_meter = None
  if self.remote_meter is Some(meter) {
    (meter.close)()
  }
  self.remote_meter = None
  self.queue.clear()
  self.pending.clear()
  self.reading = false
  self.has_remote = false
  (self.observer.speaking)(false, false)
}

///|
fn Voice::fail(self : Self, message : String) -> Unit {
  if !self.life.active {
    return
  }
  self.stop()
  (self.observer.error)(message)
}

///|
fn Voice::send(self : Self, value : Json) -> Unit {
  if !self.life.active {
    return
  }
  guard self.socket is Some(socket) && (socket.send)(value.stringify()) else {
    self.fail("通話サーバに接続していません")
  }
}

///|
fn Voice::done(self : Self, callback : () -> Unit) -> (String) -> Unit {
  let generation = self.generation
  let used = Ref(false)
  fn(error) {
    if used.val || !self.life.active || generation != self.generation {
      return
    }
    used.val = true
    if error.is_empty() {
      callback()
    } else {
      self.fail(error)
    }
  }
}

///|
fn Voice::describe(self : Self, offer : Bool, next : () -> Unit) -> Unit {
  guard self.peer is Some(peer) else { return }
  let kind = if offer { "offer" } else { "answer" }
  let generation = self.generation
  let generated = Ref(false)
  (peer.describe)(offer, fn(sdp, error) {
    if generated.val || !self.life.active || generation != self.generation {
      return
    }
    generated.val = true
    if !error.is_empty() {
      self.fail(error)
      return
    }
    let installed = Ref(false)
    (peer.set_local)(kind, sdp, fn(sdp, error) {
      if installed.val || !self.life.active || generation != self.generation {
        return
      }
      installed.val = true
      if !error.is_empty() {
        self.fail(error)
        return
      }
      let description : Json = { "type": kind.to_json(), "sdp": sdp.to_json() }
      self.send(
        if offer {
          { "type": "offer", "offer": description }
        } else {
          { "type": "answer", "answer": description }
        },
      )
      if self.life.active {
        next()
      }
    })
  })
}

///|
fn Voice::flush(self : Self, index : Int, next : () -> Unit) -> Unit {
  if !self.life.active {
    return
  }
  guard self.peer is Some(peer) else { return }
  if index >= self.pending.length() {
    self.pending.clear()
    next()
    return
  }
  (peer.ice)(
    self.pending[index],
    self.done(fn() { self.flush(index + 1, next) }),
  )
}

///|
fn Voice::drain(self : Self) -> Unit {
  if !self.life.active || self.reading || self.queue.is_empty() {
    return
  }
  guard self.peer is Some(peer) else { return }
  self.reading = true
  let next = fn() {
    self.reading = false
    self.drain()
  }
  let message = self.queue.remove(0)
  match message {
    Conversation(call) => {
      if call.id != self.id {
        self.fail("別の通話の状態を受信しました")
        return
      }
      (self.observer.conversation)(call)
      let clock = @shared.conversation_clock(call, (self.life.ports.now)()) catch {
        _ => {
          self.fail("不正な通話の状態です")
          return
        }
      }
      if !clock.can_join {
        self.stop()
      } else {
        next()
      }
    }
    Waiting => {
      (self.observer.connection)("waiting")
      next()
    }
    Offerer(offer) => {
      (self.observer.connection)("connecting")
      if offer {
        self.describe(true, next)
      } else {
        next()
      }
    }
    Description(kind, sdp) =>
      (peer.remote)(
        kind,
        sdp,
        self.done(fn() {
          self.has_remote = true
          self.flush(0, fn() {
            if kind == "offer" {
              self.describe(false, next)
            } else {
              next()
            }
          })
        }),
      )
    Candidate(candidate) =>
      if self.has_remote {
        (peer.ice)(candidate, self.done(next))
      } else if self.pending.length() >= 128 {
        self.fail("ICE が多すぎます")
      } else {
        self.pending.push(candidate)
        next()
      }
    Failure(message) => self.fail(message)
  }
}

///|
fn speaking(meter : MeterPort?) -> Bool {
  guard meter is Some(meter) else { return false }
  sound_is_speaking((meter.sample)())
}

///|
pub fn sound_is_speaking(data : Array[Double]) -> Bool {
  if data.is_empty() {
    return false
  }
  let sum = data.fold(init=0.0, fn(sum, value) { sum + value })
  (sum / data.length().to_double() / 255 * 100 + 0.5).floor() > 10
}

///|
fn Voice::sample(self : Self) -> Unit {
  if !self.life.active {
    return
  }
  (self.observer.speaking)(
    !self.muted && speaking(self.local_meter),
    speaking(self.remote_meter),
  )
  if !self.life.active {
    return
  }
  let generation = self.generation
  self.frame = (self.media.frame)(fn() {
    if generation == self.generation {
      self.sample()
    }
  })
}

///|
pub fn create_voice(
  ports : AppPorts,
  realtime : RealtimePorts,
  media : MediaPorts,
  id : Int,
  observer : VoiceObserver,
) -> VoiceController {
  let v : Voice = {
    id,
    life: scope(ports),
    media,
    observer,
    generation: 0,
    socket: None,
    peer: None,
    local_stream: None,
    remote: None,
    local_meter: None,
    remote_meter: None,
    detach: noop,
    frame: noop,
    muted: false,
    reading: false,
    has_remote: false,
    queue: [],
    pending: [],
  }
  {
    stop: fn() { v.stop() },
    mute: fn(muted) {
      v.muted = muted
      if v.local_stream is Some(stream) {
        (stream.mute)(muted)
      }
    },
    start: fn() {
      if v.life.active || id <= 0 {
        return
      }
      v.life.active = true
      v.generation += 1
      let generation = v.generation
      let valid = fn() { v.life.active && generation == v.generation }
      (observer.connection)("connecting")
      v.life.request(
        "setup",
        "GET",
        "/conversations/\{id}",
        Json::null(),
        fn(text) raise {
          let conversation = @shared.parse_conversation(text)
          guard conversation.id == id else { fail("Wrong conversation") }
          (observer.conversation)(conversation)
          if !@shared.conversation_clock(conversation, (ports.now)()).can_join {
            v.stop()
            return
          }
          v.life.request(
            "setup",
            "GET",
            "/rtc-config",
            Json::null(),
            fn(text) raise {
              let servers = @shared.checked_ice_servers(text)
              (media.acquire)(
                fn(stream) {
                  if !valid() {
                    (stream.close)()
                    return
                  }
                  v.local_stream = Some(stream)
                  (stream.mute)(v.muted)
                  v.local_meter = Some((stream.meter)(256))
                  let peer = (stream.peer)(
                    servers,
                    fn(candidate) {
                      if !valid() {
                        return
                      }
                      let payload : Json = {
                        "candidate": candidate.candidate.to_json(),
                        "sdpMid": if candidate.has_mid {
                          candidate.mid.to_json()
                        } else {
                          Json::null()
                        },
                        "sdpMLineIndex": if candidate.line >= 0 {
                          candidate.line.to_json()
                        } else {
                          Json::null()
                        },
                        "usernameFragment": if candidate.has_username {
                          candidate.username.to_json()
                        } else {
                          Json::null()
                        },
                      }
                      v.send({ "type": "ice-candidate", "candidate": payload })
                    },
                    fn(remote) {
                      if !valid() {
                        (remote.close)()
                        return
                      }
                      (v.detach)()
                      if v.remote_meter is Some(meter) {
                        (meter.close)()
                      }
                      if v.remote is Some(previous) {
                        (previous.close)()
                      }
                      v.remote = Some(remote)
                      v.remote_meter = Some((remote.meter)(256))
                      v.detach = (remote.play)(fn(error) {
                        if valid() {
                          (observer.error)(error)
                        }
                      })
                    },
                    fn(connection) {
                      if !valid() {
                        return
                      }
                      if connection == "failed" {
                        v.fail("通話が切断されました")
                      }
                      if connection == "connected" {
                        (observer.connection)("connected")
                        v.send({ "type": "media-ready" })
                      }
                    },
                  )
                  if !valid() {
                    (peer.close)()
                    return
                  }
                  v.peer = Some(peer)
                  v.socket = Some(
                    (realtime.socket)("/ws", fn(kind, text) {
                      if !valid() {
                        return
                      }
                      match kind {
                        "open" =>
                          v.send({
                            "type": "Authorization",
                            "token": ("Bearer " + (ports.token)()).to_json(),
                            "room": id.to_json(),
                          })
                        "text" => {
                          if v.queue.length() >= 256 {
                            v.fail("通話メッセージが多すぎます")
                            return
                          }
                          let message = signal(text) catch {
                            _ => {
                              v.fail("不正な通話メッセージです")
                              return
                            }
                          }
                          v.queue.push(message)
                          v.drain()
                        }
                        "close" =>
                          v.fail(
                            "通話サーバとの接続が終了しました",
                          )
                        "error" =>
                          v.fail(
                            "通話サーバに接続できませんでした",
                          )
                        _ => v.fail("不正な通話メッセージです")
                      }
                    }),
                  )
                  v.sample()
                },
                fn(error) { if valid() { v.fail(error) } },
              )
            },
            fn(error) { v.fail(error) },
          )
        },
        fn(error) { v.fail(error) },
      )
    },
  }
}
