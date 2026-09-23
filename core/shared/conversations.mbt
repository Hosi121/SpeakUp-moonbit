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
/// Validated domain data is kept separately from the mutable JS-facing view.
pub struct Call {
  model : @conversation.Conversation
  priv first : FriendSummaryDto
  priv second : FriendSummaryDto
  priv theme : String
  priv topics : Array[String]
  priv event_start : String
}

///|
pub fn Call::from_dto(d : ConversationDto) -> Call raise {
  guard d.participants.length() == 2 else { fail("Expected two participants") }
  let model = @conversation.restore(
    {
      id: d.id,
      first: d.participants[0].id,
      second: d.participants[1].id,
      started_at: d.started_at,
      ended_at: d.ended_at,
      cancelled_at: d.cancelled_at,
      revision: d.revision,
    },
    event_id=d.event_id,
    round=d.round,
  )
  {
    model,
    first: { ..d.participants[0], },
    second: { ..d.participants[1], },
    theme: d.theme,
    topics: d.topics.copy(),
    event_start: d.event_start,
  }
}

///|
pub fn Call::dto(self : Call) -> ConversationDto {
  let s = self.model.snapshot()
  let (event_id, round) = match self.model.origin() {
    Direct => (0, 0)
    Event(event, round) => (event, round)
  }
  {
    id: s.id,
    event_id,
    round,
    started_at: s.started_at,
    ended_at: s.ended_at,
    cancelled_at: s.cancelled_at,
    revision: s.revision,
    theme: self.theme,
    topics: self.topics.copy(),
    participants: [{ ..self.first, }, { ..self.second, }],
    event_start: self.event_start,
  }
}

///|
pub fn Call::partner(self : Call, actor : Int) -> FriendSummaryDto raise {
  let other = self.model.partner(@identity.UserId::from_int(actor)).value()
  if self.first.id == other {
    { ..self.first, }
  } else {
    { ..self.second, }
  }
}

///|
pub fn Call::clock(self : Call, now : Double) -> ConversationClock raise {
  {
    phase: self.model.phase().label(),
    remaining_seconds: self.model.remaining(now),
    can_finish: self.model.phase() is Active(_),
    can_join: self.model.can_join(),
    has_deadline: self.model.has_deadline(),
  }
}

///|
pub fn parse_call(text : String) -> Call raise {
  decode_call_value(@json.parse(text))
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
pub fn decode_call_value(value : Json) -> Call raise {
  // Int decoding truncates fractions on this compiler; check before narrowing.
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
  Call::from_dto(@json.from_json(value))
}

///|
pub fn parse_calls(text : String) -> Array[Call] raise {
  guard @json.parse(text) is Array(values) else {
    fail("Expected conversations")
  }
  values.map(decode_call_value)
}

///|
/// Wire compatibility adapters. MoonBit consumers use Call directly.
pub fn parse_conversation(text : String) -> ConversationDto raise {
  parse_call(text).dto()
}

///|
pub fn decode_conversation_value(value : Json) -> ConversationDto raise {
  decode_call_value(value).dto()
}

///|
pub fn parse_conversations(text : String) -> Array[ConversationDto] raise {
  parse_calls(text).map(Call::dto)
}

///|
pub fn conversation_partner(
  d : ConversationDto,
  actor : Int,
) -> FriendSummaryDto raise {
  Call::from_dto(d).partner(actor)
}

///|
pub fn conversation_clock(
  d : ConversationDto,
  now : Double,
) -> ConversationClock raise {
  Call::from_dto(d).clock(now)
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
