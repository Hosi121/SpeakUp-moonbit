///|
pub struct HistoryCursor {
  ended_at : Double
  id : @identity.ConversationId
}

///|
pub fn HistoryCursor::HistoryCursor(
  ended_at : Double,
  id : @identity.ConversationId,
) -> HistoryCursor raise {
  guard ended_at > 0 && @wire.is_safe_integer(ended_at) else {
    fail("Invalid history cursor")
  }
  { ended_at, id, }
}

///|
pub fn HistoryCursor::encode(self : Self) -> String {
  "v1.\{self.ended_at.to_int64()}.\{self.id.value()}"
}

///|
pub fn parse_history_cursor(text : String) -> HistoryCursor raise {
  guard text.length() <= 30 else { fail("Invalid history cursor") }
  guard text.split(".").to_array() is [version, time, id] && version == "v1" else {
    fail("Invalid history cursor")
  }
  for value in [time, id] {
    guard value.length() > 0 &&
      value.length() <= 16 &&
      !value.has_prefix("0") &&
      value.iter().all(fn(c) { c >= '0' && c <= '9' }) else {
      fail("Invalid history cursor")
    }
  }
  let ended_at : Double = @json.from_json(@json.parse(time.to_owned()))
  let id_number : Double = @json.from_json(@json.parse(id.to_owned()))
  guard id_number <= 2147483647 else { fail("Invalid history cursor") }
  HistoryCursor(
    ended_at,
    @identity.ConversationId::from_int(id_number.to_int()),
  )
}

///|
pub(all) struct HistoryPage {
  items : Array[ConversationDto]
  next_cursor : String
} derive(ToJson, FromJson)

///|
pub extend HistoryPage with ToJson::{to_json}

///|
pub extend HistoryPage with @json.FromJson::{from_json}

///|
pub fn parse_history_page(text : String) -> HistoryPage raise {
  let value = @json.parse(text)
  guard value
    is { "items": Array(items), "next_cursor": String(next_cursor), .. } else {
    fail("Invalid history page")
  }
  guard items.length() <= 100 else { fail("History page too large") }
  let calls = items.map(decode_conversation_value)
  let mut previous : HistoryCursor? = None
  for call in calls {
    guard call.ended_at > 0 else { fail("Unfinished history entry") }
    let current = HistoryCursor(
      call.ended_at,
      @identity.ConversationId::from_int(call.id),
    )
    if previous is Some(before) {
      guard current.ended_at < before.ended_at ||
        (
          current.ended_at == before.ended_at &&
          current.id.value() < before.id.value()
        ) else {
        fail("Unordered history page")
      }
    }
    previous = Some(current)
  }
  if !next_cursor.is_empty() {
    let next = parse_history_cursor(next_cursor)
    guard previous is Some(last) &&
      next.ended_at == last.ended_at &&
      next.id == last.id else {
      fail("Mismatched history cursor")
    }
  }
  { items: calls, next_cursor, }
}
