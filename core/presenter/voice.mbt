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
priv enum CallConnection {
  Connecting
  Waiting
  Connected
}

///|
fn CallConnection::label(self : CallConnection) -> String {
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
fn candidate_port(value : @shared.Candidate) -> IceCandidate {
  {
    candidate: value.candidate,
    mid: value.mid.unwrap_or(""),
    has_mid: value.mid is Some(_),
    line: value.line.unwrap_or(-1),
    username: value.username.unwrap_or(""),
    has_username: value.username is Some(_),
  }
}

///|
priv struct AudioInput {
  stream : StreamPort
  meter : MeterPort
}

///|
fn AudioInput::close(self : AudioInput) -> Unit {
  (self.stream.close)()
  (self.meter.close)()
}

///|
/// Intermediate stages own handles even if the next browser call throws.
priv enum VoiceMedia {
  Unavailable
  Acquiring
  Capturing(StreamPort)
  Captured(AudioInput)
  Peered(AudioInput, PeerPort)
}

///|
fn VoiceMedia::close(self : VoiceMedia) -> Unit {
  match self {
    Unavailable | Acquiring => ()
    Capturing(stream) => (stream.close)()
    Captured(audio) => audio.close()
    Peered(audio, peer) => {
      (peer.close)()
      audio.close()
    }
  }
}

///|
fn VoiceMedia::stream(self : VoiceMedia) -> StreamPort? {
  match self {
    Unavailable | Acquiring => None
    Capturing(stream) => Some(stream)
    Captured(audio) | Peered(audio, _) => Some(audio.stream)
  }
}

///|
fn VoiceMedia::meter(self : VoiceMedia) -> MeterPort? {
  match self {
    Unavailable | Acquiring | Capturing(_) => None
    Captured(audio) | Peered(audio, _) => Some(audio.meter)
  }
}

///|
priv enum RemoteAudio {
  Absent
  Capturing(StreamPort)
  Captured(AudioInput)
  Playing(AudioInput, () -> Unit)
}

///|
fn RemoteAudio::close(self : RemoteAudio) -> Unit {
  match self {
    Absent => ()
    Capturing(stream) => (stream.close)()
    Captured(audio) => audio.close()
    Playing(audio, detach) => {
      detach()
      audio.close()
    }
  }
}

///|
fn RemoteAudio::meter(self : RemoteAudio) -> MeterPort? {
  match self {
    Absent | Capturing(_) => None
    Captured(audio) | Playing(audio, _) => Some(audio.meter)
  }
}

///|
priv enum RemoteDescription {
  Awaiting(Array[IceCandidate])
  Installed
}

///|
priv struct Voice {
  id : Int
  life : Scope
  media : MediaPorts
  observer : CallObserver
  mut generation : Int
  mut socket : SocketPort?
  mut capture : VoiceMedia
  mut remote : RemoteAudio
  mut frame : () -> Unit
  mut muted : Bool
  mut reading : Bool
  mut description : RemoteDescription
  queue : Array[@shared.ServerSignal]
}

///|
fn Voice::stop(self : Self) -> Unit {
  self.life.stop()
  self.generation += 1
  (self.frame)()
  self.frame = noop
  let socket = self.socket
  let capture = self.capture
  let remote = self.remote
  self.socket = None
  self.capture = Unavailable
  self.remote = Absent
  if socket is Some(socket) {
    (socket.close)()
  }
  capture.close()
  remote.close()
  self.queue.clear()
  self.reading = false
  self.description = Awaiting([])
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
  guard self.capture is Peered(_, peer) else { return }
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
fn Voice::flush(
  self : Self,
  pending : Array[IceCandidate],
  index : Int,
  next : () -> Unit,
) -> Unit {
  if !self.life.active {
    return
  }
  guard self.capture is Peered(_, peer) else { return }
  if index >= pending.length() {
    next()
    return
  }
  (peer.ice)(
    pending[index],
    self.done(fn() { self.flush(pending, index + 1, next) }),
  )
}

///|
fn Voice::drain(self : Self) -> Unit {
  if !self.life.active || self.reading || self.queue.is_empty() {
    return
  }
  guard self.capture is Peered(_, peer) else { return }
  self.reading = true
  let next = fn() {
    self.reading = false
    self.drain()
  }
  let message = self.queue.remove(0)
  match message {
    Conversation(call) => {
      if call.model.id() != self.id {
        self.fail("別の通話の状態を受信しました")
        return
      }
      (self.observer.conversation)(call)
      if !call.model.can_join() {
        self.stop()
      } else {
        next()
      }
    }
    Waiting => {
      (self.observer.connection)(Waiting)
      next()
    }
    Assigned(role) => {
      (self.observer.connection)(Connecting)
      if role is Offerer {
        self.describe(true, next)
      } else {
        next()
      }
    }
    Peer(Offer(sdp) | Answer(sdp) as description) => {
      let offer = description is Offer(_)
      let kind = if offer { "offer" } else { "answer" }
      (peer.remote)(
        kind,
        sdp,
        self.done(fn() {
          let pending = match self.description {
            Awaiting(pending) => pending
            Installed => []
          }
          self.description = Installed
          self.flush(pending, 0, fn() {
            if offer {
              self.describe(false, next)
            } else {
              next()
            }
          })
        }),
      )
    }
    Peer(Ice(value)) => {
      let candidate = candidate_port(value)
      match self.description {
        Installed => (peer.ice)(candidate, self.done(next))
        Awaiting(pending) =>
          if pending.length() >= 128 {
            self.fail("ICE が多すぎます")
          } else {
            pending.push(candidate)
            next()
          }
      }
    }
    PeerLeft => self.fail("相手が通話から退出しました")
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
    !self.muted && speaking(self.capture.meter()),
    speaking(self.remote.meter()),
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
fn create_call_voice(
  ports : AppPorts,
  realtime : RealtimePorts,
  media : MediaPorts,
  id : Int,
  observer : CallObserver,
) -> VoiceController {
  let v : Voice = {
    id,
    life: scope(ports),
    media,
    observer,
    generation: 0,
    socket: None,
    capture: Unavailable,
    remote: Absent,
    frame: noop,
    muted: false,
    reading: false,
    description: Awaiting([]),
    queue: [],
  }
  {
    stop: fn() { v.stop() },
    mute: fn(muted) {
      v.muted = muted
      if v.capture.stream() is Some(stream) {
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
      (observer.connection)(Connecting)
      v.life.request(
        "setup",
        "GET",
        "/conversations/\{id}",
        Json::null(),
        fn(text) raise {
          let conversation = @shared.parse_call(text)
          guard conversation.model.id() == id else {
            fail("Wrong conversation")
          }
          (observer.conversation)(conversation)
          if !conversation.model.can_join() {
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
              v.capture = Acquiring
              (media.acquire)(
                fn(stream) {
                  if !valid() || !(v.capture is Acquiring) {
                    (stream.close)()
                    return
                  }
                  v.capture = Capturing(stream)
                  (stream.mute)(v.muted)
                  let audio : AudioInput = {
                    stream,
                    meter: (stream.meter)(256),
                  }
                  if !valid() {
                    audio.close()
                    return
                  }
                  v.capture = Captured(audio)
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
                      let previous = v.remote
                      v.remote = Capturing(remote)
                      previous.close()
                      let audio : AudioInput = {
                        stream: remote,
                        meter: (remote.meter)(256),
                      }
                      if !valid() {
                        audio.close()
                        return
                      }
                      v.remote = Captured(audio)
                      let detach = (remote.play)(fn(error) {
                        if valid() {
                          (observer.error)(error)
                        }
                      })
                      if valid() {
                        v.remote = Playing(audio, detach)
                      } else {
                        detach()
                      }
                    },
                    fn(connection) {
                      if !valid() {
                        return
                      }
                      if connection == "failed" {
                        v.fail("通話が切断されました")
                      }
                      if connection == "connected" {
                        (observer.connection)(Connected)
                        v.send({ "type": "media-ready" })
                      }
                    },
                  )
                  if !valid() {
                    (peer.close)()
                    return
                  }
                  v.capture = Peered(audio, peer)
                  let socket = (realtime.socket)("/ws", fn(kind, text) {
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
                        guard @shared.parse_server_signal(text) is Some(message) else {
                          v.fail("不正な通話メッセージです")
                          return
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
                  })
                  if !valid() {
                    (socket.close)()
                    return
                  }
                  v.socket = Some(socket)
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

///|
/// Concrete JS façade; typed calls and connection states stay inside MoonBit.
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
