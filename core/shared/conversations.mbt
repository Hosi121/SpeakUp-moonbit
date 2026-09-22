///|
/// Flat wire records are generated into TypeScript; domain enums stay internal.
pub(all) struct ConversationDto {
  id : Int
  event_id : Int
  round : Int
  started_at : Double
  ended_at : Double
  cancelled_at : Double
  revision : Int
  theme : String
  topics : Array[String]
  participants : Array[FriendSummaryDto]
  event_start : String
} derive(ToJson, FromJson)

///|
pub(all) struct ConversationClock {
  phase : String
  remaining_seconds : Int
  can_finish : Bool
  can_join : Bool
  has_deadline : Bool
}

///|
pub(all) struct ReflectionDto {
  saved : Bool
  satisfaction : Int
  comment : String
  learned_expressions : String
  updated_at : String
} derive(ToJson, FromJson)

///|
fn snapshot(d : ConversationDto) -> @conversation.Snapshot raise {
  guard d.participants.length() == 2 else { fail("Expected two participants") }
  {
    id: d.id,
    first: d.participants[0].id,
    second: d.participants[1].id,
    started_at: d.started_at,
    ended_at: d.ended_at,
    cancelled_at: d.cancelled_at,
    revision: d.revision,
  }
}

///|
fn validate_conversation(d : ConversationDto) -> Unit raise {
  @conversation.state(snapshot(d)) |> ignore
  guard (d.event_id == 0 && d.round == 0) || (d.event_id > 0 && d.round > 0) else {
    fail("Invalid origin")
  }
}

///|
pub fn conversation_partner(
  d : ConversationDto,
  actor : Int,
) -> FriendSummaryDto raise {
  let other = @conversation.partner(snapshot(d), actor)
  if d.participants[0].id == other {
    d.participants[0]
  } else {
    d.participants[1]
  }
}

///|
pub fn parse_conversation(text : String) -> ConversationDto raise {
  decode_conversation_value(@json.parse(text))
}

///|
fn integer_field(
  value : Json,
  key : String,
  minimum : Double,
  maximum : Double,
) -> Unit raise {
  @wire.integer_field(value, key, minimum, maximum)
}

///|
fn decode_conversation_value(value : Json) -> ConversationDto raise {
  // FromJson for Int truncates fractional numbers on this compiler. Validate
  // the original JSON before any narrowing conversion can lose information.
  integer_field(value, "id", 1, 2147483647)
  integer_field(value, "event_id", 0, 2147483647)
  integer_field(value, "round", 0, 2147483647)
  integer_field(value, "revision", 0, 2)
  guard value is { "participants": Array(participants), .. } else {
    fail("Expected participants")
  }
  for participant in participants {
    integer_field(participant, "id", 1, 2147483647)
  }
  let dto : ConversationDto = @json.from_json(value)
  validate_conversation(dto)
  dto
}

///|
pub fn parse_conversations(text : String) -> Array[ConversationDto] raise {
  guard @json.parse(text) is Array(values) else {
    fail("Expected conversations")
  }
  values.map(decode_conversation_value)
}

///|
pub fn conversation_clock(
  d : ConversationDto,
  now : Double,
) -> ConversationClock raise {
  let s = snapshot(d)
  let phase = @conversation.state(s)
  {
    phase,
    remaining_seconds: @conversation.remaining(
      s,
      now,
      if d.event_id == 0 {
        0
      } else {
        300
      },
    ),
    can_finish: phase == "active",
    can_join: phase == "planned" || phase == "active",
    has_deadline: d.event_id != 0,
  }
}

///|
pub fn parse_reflection(text : String) -> ReflectionDto raise {
  let value = @json.parse(text)
  integer_field(value, "satisfaction", 0, 100)
  let dto : ReflectionDto = @json.from_json(value)
  guard dto.satisfaction >= 0 && dto.satisfaction <= 100 else {
    fail("Invalid satisfaction")
  }
  dto
}

///|
/// JS entry points must not expose MoonBit's internal Result ABI. On the JS
/// target, try! produces a catchable JS Error; the HTTP/UI adapters handle it.
/// MoonBit callers use the checked functions above and retain typed errors.
pub fn decode_conversation(text : String) -> ConversationDto {
  try! parse_conversation(text)
}

///|
pub fn decode_conversations(text : String) -> Array[ConversationDto] {
  try! parse_conversations(text)
}

///|
pub fn view_conversation_clock(
  d : ConversationDto,
  now : Double,
) -> ConversationClock {
  try! conversation_clock(d, now)
}

///|
pub fn view_conversation_partner(
  d : ConversationDto,
  actor : Int,
) -> FriendSummaryDto {
  try! conversation_partner(d, actor)
}

///|
pub fn decode_reflection(text : String) -> ReflectionDto {
  try! parse_reflection(text)
}

///|
pub extend ConversationDto with ToJson::{to_json}

///|
pub extend ConversationDto with @json.FromJson::{from_json}

///|
pub extend ReflectionDto with ToJson::{to_json}

///|
pub extend ReflectionDto with @json.FromJson::{from_json}
