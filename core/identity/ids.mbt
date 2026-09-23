///|
pub suberror InvalidId derive(Debug)

///|
pub struct UserId {
  priv value : Int
} derive(Eq)

///|
pub struct ConversationId {
  priv value : Int
} derive(Eq)

///|
pub struct MessageId {
  priv value : Int
} derive(Eq)

///|
pub fn UserId::from_int(value : Int) -> UserId raise InvalidId {
  guard value > 0 else { raise InvalidId }
  { value, }
}

///|
pub fn ConversationId::from_int(value : Int) -> ConversationId raise InvalidId {
  guard value > 0 else { raise InvalidId }
  { value, }
}

///|
pub fn MessageId::from_int(value : Int) -> MessageId raise InvalidId {
  guard value > 0 else { raise InvalidId }
  { value, }
}

///|
pub fn UserId::value(self : Self) -> Int {
  self.value
}

///|
pub fn ConversationId::value(self : Self) -> Int {
  self.value
}

///|
pub fn MessageId::value(self : Self) -> Int {
  self.value
}

///|
pub impl ToJson for UserId with fn to_json(self) {
  self.value.to_json()
}

///|
pub impl ToJson for ConversationId with fn to_json(self) {
  self.value.to_json()
}

///|
pub impl ToJson for MessageId with fn to_json(self) {
  self.value.to_json()
}

///|
pub extend UserId with ToJson::{to_json}

///|
pub extend ConversationId with ToJson::{to_json}

///|
pub extend MessageId with ToJson::{to_json}

///|
pub extend UserId with Eq::{equal, not_equal}

///|
pub extend ConversationId with Eq::{equal, not_equal}

///|
pub extend MessageId with Eq::{equal, not_equal}

///|
pub impl Compare for UserId with fn compare(self, other) {
  self.value.compare(other.value)
}

///|
pub extend UserId with Compare::{compare, op_lt, op_le, op_gt, op_ge}

///|
pub extend InvalidId with @debug.Debug::{to_repr}
