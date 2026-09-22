///|
pub(all) struct SocialDto {
  friends : Array[FriendSummaryDto]
  incoming : Array[FriendSummaryDto]
  outgoing : Array[FriendSummaryDto]
} derive(ToJson, FromJson)

///|
pub extend SocialDto with ToJson::{to_json}

///|
pub extend SocialDto with @json.FromJson::{from_json}

///|
pub(all) struct NotificationDto {
  id : Int
  kind : String
  actor : FriendSummaryDto
  conversation_id : Int
  message_id : Int
  read : Bool
  created_at : String
} derive(ToJson, FromJson)

///|
pub extend NotificationDto with ToJson::{to_json}

///|
pub extend NotificationDto with @json.FromJson::{from_json}

///|
pub(all) struct InboxDto {
  items : Array[NotificationDto]
  unread : Int
  now : Double
} derive(ToJson, FromJson)

///|
pub extend InboxDto with ToJson::{to_json}

///|
pub extend InboxDto with @json.FromJson::{from_json}

///|
pub(all) struct MessageDto {
  id : Int
  sender_id : Int
  recipient_id : Int
  body : String
  created_at : String
  read_at : String
} derive(ToJson, FromJson)

///|
pub extend MessageDto with ToJson::{to_json}

///|
pub extend MessageDto with @json.FromJson::{from_json}

///|
pub(all) struct ThreadDto {
  peer : FriendSummaryDto
  messages : Array[MessageDto]
  has_older : Bool
} derive(ToJson, FromJson)

///|
pub extend ThreadDto with ToJson::{to_json}

///|
pub extend ThreadDto with @json.FromJson::{from_json}

///|
pub(all) struct AchievementDto {
  code : String
  title : String
  progress : Int
  target : Int
  earned : Bool
} derive(ToJson, FromJson)

///|
pub extend AchievementDto with ToJson::{to_json}

///|
pub extend AchievementDto with @json.FromJson::{from_json}

///|
pub(all) struct StatsDto {
  total_calls : Int
  event_calls : Int
  direct_calls : Int
  partners : Int
  minutes : Int
  reflections : Int
  achievements : Array[AchievementDto]
} derive(ToJson, FromJson)

///|
pub extend StatsDto with ToJson::{to_json}

///|
pub extend StatsDto with @json.FromJson::{from_json}

///|
pub(all) struct EventOverviewDto {
  event : EventDto
  participates_bit : Int
  registered_count : Int
  matching_state : String
} derive(ToJson, FromJson)

///|
pub extend EventOverviewDto with ToJson::{to_json}

///|
pub extend EventOverviewDto with @json.FromJson::{from_json}

///|
pub(all) struct EventMemberDto {
  user : FriendSummaryDto
  participates_bit : Int
  matched_bit : Int
} derive(ToJson, FromJson)

///|
pub extend EventMemberDto with ToJson::{to_json}

///|
pub extend EventMemberDto with @json.FromJson::{from_json}

///|
pub(all) struct EventRosterDto {
  members : Array[EventMemberDto]
} derive(ToJson, FromJson)

///|
pub extend EventRosterDto with ToJson::{to_json}

///|
pub extend EventRosterDto with @json.FromJson::{from_json}

///|
pub(all) struct LearningDto {
  answers : Array[Int]
  feedback : String
  feedback_current : Bool
  updated_at : String
} derive(ToJson, FromJson)

///|
pub extend LearningDto with ToJson::{to_json}

///|
pub extend LearningDto with @json.FromJson::{from_json}

///|
fn validate_friend(v : Json) -> Unit raise {
  integer_field(v, "id", 1, 2147483647)
  let _ : FriendSummaryDto = @json.from_json(v)
}

///|
fn json_array(v : Json, name : String) -> Array[Json] raise {
  guard v is Object(o) else { fail("Expected object") }
  guard o.get(name) is Some(Array(xs)) else { fail("Expected array") }
  xs
}

///|
pub fn checked_social(text : String) -> SocialDto raise {
  let v = @json.parse(text)
  for key in ["friends", "incoming", "outgoing"] {
    for f in json_array(v, key) {
      validate_friend(f)
    }
  }
  @json.from_json(v)
}

///|
pub fn checked_inbox(text : String) -> InboxDto raise {
  let v = @json.parse(text)
  integer_field(v, "unread", 0, 2147483647)
  integer_field(v, "now", 1, 9007199254740991)
  for n in json_array(v, "items") {
    integer_field(n, "id", 1, 2147483647)
    integer_field(n, "conversation_id", 0, 2147483647)
    integer_field(n, "message_id", 0, 2147483647)
    guard n is { "actor": actor, "kind": String(kind), .. } else {
      fail("Invalid notification")
    }
    validate_friend(actor)
    guard [
      "friend_request", "friend_accepted", "call_invitation", "message", "event_matched",
    ].contains(kind) else {
      fail("Invalid notification kind")
    }
  }
  @json.from_json(v)
}

///|
pub fn checked_thread(text : String) -> ThreadDto raise {
  let v = @json.parse(text)
  guard v is { "peer": peer, .. } else { fail("Expected peer") }
  validate_friend(peer)
  for m in json_array(v, "messages") {
    for key in ["id", "sender_id", "recipient_id"] {
      integer_field(m, key, 1, 2147483647)
    }
    let d : MessageDto = @json.from_json(m)
    guard d.sender_id != d.recipient_id && d.body.length() <= 2000 else {
      fail("Invalid message")
    }
  }
  @json.from_json(v)
}

///|
pub fn checked_stats(text : String) -> StatsDto raise {
  let v = @json.parse(text)
  for
    key in [
      "total_calls", "event_calls", "direct_calls", "partners", "minutes", "reflections",
    ] {
    integer_field(v, key, 0, 2147483647)
  }
  for a in json_array(v, "achievements") {
    integer_field(a, "progress", 0, 2147483647)
    integer_field(a, "target", 1, 2147483647)
  }
  @json.from_json(v)
}

///|
pub fn checked_events(text : String) -> Array[EventOverviewDto] raise {
  guard @json.parse(text) is Array(xs) else { fail("Expected events") }
  for v in xs {
    integer_field(v, "participates_bit", 0, 7)
    integer_field(v, "registered_count", 0, 2147483647)
    guard v is { "event": e, "matching_state": String(state), .. } else {
      fail("Invalid event")
    }
    integer_field(e, "id", 1, 2147483647)
    integer_field(e, "theme_id", 1, 2147483647)
    guard ["open", "matching", "published"].contains(state) else {
      fail("Invalid matching state")
    }
  }
  @json.from_json(xs.to_json())
}

///|
pub fn checked_roster(text : String) -> EventRosterDto raise {
  let v = @json.parse(text)
  for m in json_array(v, "members") {
    integer_field(m, "participates_bit", 0, 7)
    integer_field(m, "matched_bit", 0, 7)
    guard m is { "user": u, .. } else { fail("Expected user") }
    validate_friend(u)
  }
  @json.from_json(v)
}

///|
pub fn checked_learning(text : String) -> LearningDto raise {
  let v = @json.parse(text)
  let answers = json_array(v, "answers")
  guard answers.is_empty() || answers.length() == 6 else {
    fail("Expected six answers")
  }
  for answer in answers {
    integer_field({ "answer": answer }, "answer", 0, 2)
  }
  @json.from_json(v)
}

///|
pub fn decode_social(text : String) -> SocialDto {
  try! checked_social(text)
}

///|
pub fn decode_inbox(text : String) -> InboxDto {
  try! checked_inbox(text)
}

///|
pub fn decode_thread(text : String) -> ThreadDto {
  try! checked_thread(text)
}

///|
pub fn decode_stats(text : String) -> StatsDto {
  try! checked_stats(text)
}

///|
pub fn decode_events(text : String) -> Array[EventOverviewDto] {
  try! checked_events(text)
}

///|
pub fn decode_roster(text : String) -> EventRosterDto {
  try! checked_roster(text)
}

///|
pub fn decode_learning(text : String) -> LearningDto {
  try! checked_learning(text)
}

///|
pub fn activity_token(text : String) -> String raise {
  guard text.length() <= 8192 else { fail("Authentication too large") }
  guard @json.parse(text) is { "token": String(token), .. } else {
    fail("Expected token")
  }
  guard token.length() > 7 && token.has_prefix("Bearer ") else {
    fail("Expected bearer token")
  }
  token
}

///|
pub fn decode_activity_token(text : String) -> String {
  try! activity_token(text)
}
