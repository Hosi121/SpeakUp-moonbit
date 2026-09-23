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
pub fn sound_is_speaking(data : Array[Double]) -> Bool {
  if data.is_empty() {
    return false
  }
  let sum = data.fold(init=0.0, fn(sum, value) { sum + value })
  (sum / data.length().to_double() / 255 * 100 + 0.5).floor() > 10
}
