///|
/// Wire DTOs are canonical here. `moon build` generates the TypeScript types.
pub(all) struct EventThemeDto {
  theme_text : String
  topic1 : String
  topic2 : String
  topic3 : String
} derive(ToJson, FromJson)

///|
pub(all) struct EventDto {
  id : Int
  event_start : String
  event_end : String
  theme_id : Int
  theme : EventThemeDto
} derive(ToJson, FromJson)

///|
pub(all) struct EventTheme {
  themeText : String
  topic1 : String
  topic2 : String
  topic3 : String
}

///|
pub(all) struct Event {
  id : Int
  eventStart : String
  eventEnd : String
  themeId : Int
  theme : EventTheme
}

///|
pub(all) struct UserDto {
  id : Int
  username : String
  email : String
  avatar_url : String
  created_at : String
} derive(ToJson, FromJson)

///|
pub(all) struct UserProfileDto {
  id : Int
  username : String
  email : String
  avatar_url : String
  role : String
  created_at : String
  updated_at : String
} derive(ToJson, FromJson)

///|
pub(all) struct User {
  id : Int
  username : String
  email : String
  avatarUrl : String
  createdAt : String
}

///|
pub(all) struct UserProfile {
  id : Int
  username : String
  email : String
  avatarUrl : String
  role : String
  createdAt : String
  updatedAt : String
}

///|
pub(all) struct FriendSummaryDto {
  id : Int
  username : String
  avatar_url : String
} derive(ToJson, FromJson)

///|
pub(all) struct FriendSummary {
  id : Int
  username : String
  avatarUrl : String
}

///|
pub(all) struct MemoDto {
  memo1 : String
  memo2 : String
} derive(ToJson, FromJson)

///|
pub(all) struct UserNotes {
  carryInMemo : String
  wordList : String
}

///|
pub(all) struct SessionDto {
  theme : String
  date_time : String
  sessions : Array[Int]
} derive(ToJson, FromJson)

///|
pub(all) struct SessionData {
  theme : String
  dateTime : String
  sessions : Array[Int]
}

///|
pub(all) struct ConversationExample {
  english : String
  japanese : String
} derive(ToJson, FromJson)

///|
pub(all) struct ConversationHistoryDto {
  date : String
  previous_date : String
  sessions : Int
  completion_rate : String
  comment : String
  examples : Array[ConversationExample]
} derive(ToJson, FromJson)

///|
pub(all) struct ConversationHistoryItem {
  date : String
  previousDate : String
  sessions : Int
  completionRate : String
  comment : String
  examples : Array[ConversationExample]
}

///|
pub fn map_event(d : EventDto) -> Event {
  {
    id: d.id,
    eventStart: d.event_start,
    eventEnd: d.event_end,
    themeId: d.theme_id,
    theme: {
      themeText: d.theme.theme_text,
      topic1: d.theme.topic1,
      topic2: d.theme.topic2,
      topic3: d.theme.topic3,
    },
  }
}

///|
pub fn map_user(d : UserDto) -> User {
  {
    id: d.id,
    username: d.username,
    email: d.email,
    avatarUrl: d.avatar_url,
    createdAt: d.created_at,
  }
}

///|
pub fn map_profile(d : UserProfileDto) -> UserProfile {
  {
    id: d.id,
    username: d.username,
    email: d.email,
    avatarUrl: d.avatar_url,
    role: d.role,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }
}

///|
pub fn map_friend(d : FriendSummaryDto) -> FriendSummary {
  { id: d.id, username: d.username, avatarUrl: d.avatar_url, }
}

///|
pub fn from_memo(d : MemoDto) -> UserNotes {
  { carryInMemo: d.memo1, wordList: d.memo2, }
}

///|
pub fn to_memo(d : UserNotes) -> MemoDto {
  { memo1: d.carryInMemo, memo2: d.wordList, }
}

///|
pub fn map_session(d : SessionDto) -> SessionData {
  { theme: d.theme, dateTime: d.date_time, sessions: d.sessions, }
}

///|
pub fn map_conversation(d : ConversationHistoryDto) -> ConversationHistoryItem {
  {
    date: d.date,
    previousDate: d.previous_date,
    sessions: d.sessions,
    completionRate: d.completion_rate,
    comment: d.comment,
    examples: d.examples,
  }
}

///|
pub fn normalize_avatar(raw : String, origin : String) -> String {
  if raw == "" || raw.has_prefix("http://") || raw.has_prefix("https://") {
    raw
  } else {
    origin + raw
  }
}

///|
pub extend EventThemeDto with ToJson::{to_json}

///|
pub extend EventThemeDto with @json.FromJson::{from_json}

///|
pub extend EventDto with ToJson::{to_json}

///|
pub extend EventDto with @json.FromJson::{from_json}

///|
pub extend UserDto with ToJson::{to_json}

///|
pub extend UserDto with @json.FromJson::{from_json}

///|
pub extend UserProfileDto with ToJson::{to_json}

///|
pub extend UserProfileDto with @json.FromJson::{from_json}

///|
pub extend FriendSummaryDto with ToJson::{to_json}

///|
pub extend FriendSummaryDto with @json.FromJson::{from_json}

///|
pub extend MemoDto with ToJson::{to_json}

///|
pub extend MemoDto with @json.FromJson::{from_json}

///|
pub extend SessionDto with ToJson::{to_json}

///|
pub extend SessionDto with @json.FromJson::{from_json}

///|
pub extend ConversationExample with ToJson::{to_json}

///|
pub extend ConversationExample with @json.FromJson::{from_json}

///|
pub extend ConversationHistoryDto with ToJson::{to_json}

///|
pub extend ConversationHistoryDto with @json.FromJson::{from_json}
