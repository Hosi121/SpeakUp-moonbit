///|
pub(all) suberror HostError {
  Credentials
  NotConfigured
  Conflict
  Unavailable
  InvalidData
} derive(Debug)

///|
pub(all) enum AuthAction {
  SignIn
  SignUp
}

///|
pub(all) struct Credentials {
  email : String
  password : String
}

///|
pub(all) enum ChatKind {
  Ask
  Theme
  Feedback
}

///|
/// Preserve upstream response metadata at the HTTP edge, while application
/// policy consumes the validated content through a concrete reply type.
pub struct ChatReply {
  content : String
  priv payload : Json
}

///|
pub fn ChatReply::decode(payload : Json) -> ChatReply raise {
  guard payload
    is {
      "choices": Array(
        [{ "message": { "content": String(content), .. }, .. }, ..]
      ),
      ..
    } else {
    raise HostError::InvalidData
  }
  { content, payload, }
}

///|
pub impl ToJson for ChatReply with fn to_json(self) {
  self.payload
}

///|
pub extend ChatReply with ToJson::{to_json}

///|
pub(all) struct EventTimes {
  start : String
  end : String
} derive(FromJson)

///|
pub extend EventTimes with @json.FromJson::{from_json}

///|
pub(all) struct Host {
  database : Database
  authenticate : async (AuthAction, Credentials) -> Unit
  issue_token : async (@identity.UserId) -> String
  chat : async (ChatKind, String) -> ChatReply
  now : () -> String
  now_millis : () -> Double
  public_url : (String) -> String
  event_times : (String) -> EventTimes?
}

///|
pub struct Api {
  priv host : Host
  priv notify : (@identity.UserId) -> Unit
}

///|
pub fn Api::Api(
  host : Host,
  notify? : (@identity.UserId) -> Unit = fn(_) { () },
) -> Api {
  { host, notify, }
}

///|
pub extend HostError with @debug.Debug::{to_repr}
