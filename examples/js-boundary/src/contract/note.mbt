///|
pub(all) struct Note {
  id : Int
  created_at : Double
  text : String
} derive(FromJson)

///|
fn parse_note(value : Json) -> Note raise {
  @wire.integer_field(value, "id", 1, 2147483647)
  @wire.integer_field(value, "created_at", 0, 9007199254740991.0)
  @json.from_json(value)
}

///|
pub fn decode_note(text : String) -> Note {
  @wire.decode_or_throw(text, parse_note)
}

///|
pub extend Note with @json.FromJson::{from_json}
