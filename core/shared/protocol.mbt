///|
/// A validated, JS-friendly projection. No MoonBit enum/Json crosses FFI.
pub(all) struct ParsedSignal {
  kind : String
  token : String
  room : Int
  payload : String
  isOffer : Bool
  error : String
}

///|
pub fn parse_signal(text : String) -> ParsedSignal {
  let invalid : ParsedSignal = {
    kind: "error",
    token: "",
    room: 0,
    payload: "",
    isOffer: false,
    error: "invalid message",
  }
  if text.length() > 65536 {
    return invalid
  }
  let value = @json.parse(text) catch { _ => return invalid }
  match value {
    {
      "type": String("Authorization"),
      "token": String(token),
      "room": Number(room, ..),
      ..
    } => {
      if token.length() < 8 ||
        !token.has_prefix("Bearer ") ||
        room < 1 ||
        room > 2147483647 ||
        room != room.to_int().to_double() {
        return invalid
      }
      {
        ..invalid,
        kind: "Authorization",
        token,
        room: room.to_int(),
        error: "",
      }
    }
    {
      "type": String("offer"),
      "offer": { "type": String("offer"), "sdp": String(sdp), .. } as payload,
      ..
    } => {
      if sdp.length() == 0 || sdp.length() > 60000 {
        return invalid
      }
      { ..invalid, kind: "offer", payload: payload.stringify(), error: "", }
    }
    {
      "type": String("answer"),
      "answer": { "type": String("answer"), "sdp": String(sdp), .. } as payload,
      ..
    } => {
      if sdp.length() == 0 || sdp.length() > 60000 {
        return invalid
      }
      { ..invalid, kind: "answer", payload: payload.stringify(), error: "", }
    }
    {
      "type": String("ice-candidate"),
      "candidate": { "candidate": String(candidate), .. } as payload,
      ..
    } => {
      if candidate.length() > 4096 {
        return invalid
      }
      guard payload is Object(fields) else { return invalid }
      match fields.get("sdpMid") {
        None | Some(Null) | Some(String(_)) => ()
        _ => return invalid
      }
      match fields.get("sdpMLineIndex") {
        None | Some(Null) => ()
        Some(Number(n, ..)) =>
          if n < 0 || n > 65535 || n != n.to_int().to_double() {
            return invalid
          }
        _ => return invalid
      }
      match fields.get("usernameFragment") {
        None | Some(Null) | Some(String(_)) => ()
        _ => return invalid
      }
      {
        ..invalid,
        kind: "ice-candidate",
        payload: payload.stringify(),
        error: "",
      }
    }
    { "type": String("callType"), "isOffer": True, .. } =>
      { ..invalid, kind: "callType", isOffer: true, error: "", }
    { "type": String("callType"), .. } =>
      { ..invalid, kind: "callType", error: "", }
    { "type": String("waiting"), .. } =>
      { ..invalid, kind: "waiting", error: "", }
    { "type": String("peer-left"), .. } =>
      { ..invalid, kind: "peer-left", error: "", }
    { "type": String("error"), "error": String(message), .. } =>
      { ..invalid, error: message, }
    _ => invalid
  }
}
