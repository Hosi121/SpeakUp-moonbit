///|
/// Compatibility projection for JS. Internal consumers use directional messages.
pub(all) struct ParsedSignal {
  kind : String
  token : String
  room : Int
  payload : String
  isOffer : Bool
  error : String
}

///|
pub(all) enum Role {
  Offerer
  Answerer
}

///|
pub struct Candidate {
  candidate : String
  mid : String?
  line : Int?
  username : String?
}

///|
pub(all) enum PeerSignal {
  Offer(String)
  Answer(String)
  Ice(Candidate)
}

///|
pub(all) enum ClientSignal {
  Peer(PeerSignal)
  MediaReady
}

///|
pub(all) enum ServerSignal {
  Peer(PeerSignal)
  Conversation(Call)
  Waiting
  PeerLeft
  Assigned(Role)
  Failure(String)
}

///|
/// This union exists only in the wire decoder, before direction is checked.
priv enum WireSignal {
  Authorization(String, Int)
  Relay(PeerSignal, Json)
  MediaReady
  Conversation(Call, Json)
  Waiting
  PeerLeft
  Assigned(Role)
  Failure(String)
}

///|
fn optional_signal_text(
  fields : Map[String, Json],
  key : String,
) -> String? raise {
  match fields.get(key) {
    None | Some(Null) => None
    Some(String(text)) => Some(text)
    _ => fail("Invalid ICE text")
  }
}

///|
fn decode_signal(text : String, with_conversation : Bool) -> WireSignal? {
  if text.length() > 65536 {
    return None
  }
  let value = @json.parse(text) catch { _ => return None }
  match value {
    {
      "type": "Authorization",
      "token": String(token),
      "room": Number(room, ..),
      ..
    } => {
      guard token.length() >= 8 &&
        token.has_prefix("Bearer ") &&
        room >= 1 &&
        room <= 2147483647 &&
        room == room.to_int().to_double() else {
        return None
      }
      Some(Authorization(token, room.to_int()))
    }
    {
      "type": "offer",
      "offer": { "type": "offer", "sdp": String(sdp), .. } as payload,
      ..
    } => {
      guard !sdp.is_empty() && sdp.length() <= 60000 else { return None }
      Some(Relay(Offer(sdp), payload))
    }
    {
      "type": "answer",
      "answer": { "type": "answer", "sdp": String(sdp), .. } as payload,
      ..
    } => {
      guard !sdp.is_empty() && sdp.length() <= 60000 else { return None }
      Some(Relay(Answer(sdp), payload))
    }
    {
      "type": "ice-candidate",
      "candidate": { "candidate": String(candidate), .. } as payload,
      ..
    } => {
      guard candidate.length() <= 4096 && payload is Object(fields) else {
        return None
      }
      let mid = optional_signal_text(fields, "sdpMid") catch {
        _ => return None
      }
      let username = optional_signal_text(fields, "usernameFragment") catch {
        _ => return None
      }
      let line = match fields.get("sdpMLineIndex") {
        None | Some(Null) => None
        Some(Number(n, ..)) if n >= 0 &&
          n <= 65535 &&
          n == n.to_int().to_double() => Some(n.to_int())
        _ => return None
      }
      Some(Relay(Ice({ candidate, mid, line, username, }), payload))
    }
    { "type": "callType", "isOffer": True, .. } => Some(Assigned(Offerer))
    // Legacy Go omits false; absence and explicit false both mean answerer.
    { "type": "callType", .. } => Some(Assigned(Answerer))
    { "type": "waiting", .. } => Some(Waiting)
    { "type": "peer-left", .. } => Some(PeerLeft)
    { "type": "media-ready", .. } => Some(MediaReady)
    { "type": "conversation", "value": value, .. } if with_conversation => {
      let call = decode_call_value(value) catch { _ => return None }
      Some(Conversation(call, value))
    }
    { "type": "error", "error": String(message), .. } => Some(Failure(message))
    _ => None
  }
}

///|
pub struct Authorization {
  token : String
  room : Int
}

///|
pub fn parse_authorization(text : String) -> Authorization? {
  match decode_signal(text, false) {
    Some(Authorization(token, room)) => Some({ token, room, })
    _ => None
  }
}

///|
pub fn parse_client_signal(text : String) -> ClientSignal? {
  match decode_signal(text, false) {
    Some(Relay(message, _)) => Some(Peer(message))
    Some(MediaReady) => Some(MediaReady)
    _ => None
  }
}

///|
pub fn parse_server_signal(text : String) -> ServerSignal? {
  match decode_signal(text, true) {
    Some(Relay(message, _)) => Some(Peer(message))
    Some(Conversation(call, _)) => Some(Conversation(call))
    Some(Waiting) => Some(Waiting)
    Some(PeerLeft) => Some(PeerLeft)
    Some(Assigned(role)) => Some(Assigned(role))
    Some(Failure(error)) => Some(Failure(error))
    _ => None
  }
}

///|
pub fn parse_signal(text : String) -> ParsedSignal {
  project_signal(text, true)
}

///|
pub fn validate_signal(text : String) -> ParsedSignal {
  project_signal(text, false)
}

///|
fn project_signal(text : String, capture : Bool) -> ParsedSignal {
  let empty : ParsedSignal = {
    kind: "error",
    token: "",
    room: 0,
    payload: "",
    isOffer: false,
    error: "",
  }
  match decode_signal(text, capture) {
    None => { ..empty, error: "invalid message", }
    Some(Authorization(token, room)) =>
      { ..empty, kind: "Authorization", token, room, }
    Some(Relay(message, payload)) => {
      let kind = match message {
        Offer(_) => "offer"
        Answer(_) => "answer"
        Ice(_) => "ice-candidate"
      }
      {
        ..empty,
        kind,
        payload: if capture {
          payload.stringify()
        } else {
          ""
        },
      }
    }
    Some(MediaReady) => { ..empty, kind: "media-ready", }
    Some(Assigned(role)) =>
      { ..empty, kind: "callType", isOffer: role is Offerer, }
    Some(Waiting) => { ..empty, kind: "waiting", }
    Some(PeerLeft) => { ..empty, kind: "peer-left", }
    Some(Conversation(_, payload)) =>
      { ..empty, kind: "conversation", payload: payload.stringify(), }
    Some(Failure(error)) => { ..empty, error, }
  }
}
