///|
pub(all) struct SignUpResult {
  success : Bool
  message : String
}

///|
pub(all) struct IceServerDto {
  urls : Array[String]
  username : String
  credential : String
}

///|
fn http_text(value : Json, key : String) -> String raise {
  guard value is Object(fields) else { fail("Expected an object") }
  guard fields.get(key) is Some(String(text)) else {
    fail("Expected string: \{key}")
  }
  text
}

///|
fn http_optional_text(value : Json, key : String) -> String raise {
  guard value is Object(fields) else { fail("Expected an object") }
  match fields.get(key) {
    None => ""
    Some(String(text)) => text
    _ => fail("Expected string: \{key}")
  }
}

///|
fn checked_profile_response(text : String) -> UserProfile raise {
  let value = @json.parse(text)
  integer_field(value, "id", 1, 2147483647)
  map_profile(@json.from_json(value))
}

///|
fn checked_users_response(text : String) -> Array[User] raise {
  guard @json.parse(text) is Array(values) else { fail("Expected users") }
  values.map(fn(value) raise {
    integer_field(value, "id", 1, 2147483647)
    map_user(@json.from_json(value))
  })
}

///|
fn checked_event_response(text : String) -> Event raise {
  let value = @json.parse(text)
  integer_field(value, "id", 1, 2147483647)
  integer_field(value, "theme_id", 1, 2147483647)
  map_event(@json.from_json(value))
}

///|
fn checked_memo_response(text : String) -> UserNotes raise {
  guard @json.parse(text) is Object(fields) else { fail("Expected a memo") }
  let field = fn(key : String) -> String raise {
    match fields.get(key) {
      None | Some(Null) => ""
      Some(String(text)) => text
      _ => fail("Expected memo text")
    }
  }
  from_memo({ memo1: field("memo1"), memo2: field("memo2"), })
}

///|
fn checked_token_response(text : String) -> String raise {
  let token = http_text(@json.parse(text), "token")
  guard !token.is_empty() else { fail("Expected a token") }
  token
}

///|
fn checked_signup_response(text : String) -> SignUpResult raise {
  guard @json.parse(text) is { "success": True, "message": String(message), .. } else {
    fail("Invalid sign-up response")
  }
  { success: true, message, }
}

///|
fn checked_avatar_response(text : String) -> String raise {
  let url = http_text(@json.parse(text), "avatar_url")
  guard !url.is_empty() else { fail("Expected an avatar URL") }
  url
}

///|
fn checked_chat_response(text : String) -> String raise {
  guard @json.parse(text)
    is {
      "choices": Array(
        [{ "message": { "content": String(content), .. }, .. }, ..]
      ),
      ..
    } else {
    fail("Invalid assistant response")
  }
  guard !content.is_empty() else { fail("Expected an assistant message") }
  content
}

///|
fn checked_ice_servers(text : String) -> Array[IceServerDto] raise {
  let value = @json.parse(text)
  json_array(value, "iceServers").map(fn(server) raise {
    guard server is { "urls": raw, .. } else { fail("Expected ICE URLs") }
    let urls : Array[String] = match raw {
      String(url) => [url]
      Array(values) =>
        values.map(fn(value) raise {
          guard value is String(url) else { fail("Expected an ICE URL") }
          url
        })
      _ => fail("Expected ICE URLs")
    }
    guard urls.length() > 0 else { fail("Expected an ICE URL") }
    for url in urls {
      guard !url.is_empty() else { fail("Expected an ICE URL") }
    }
    {
      urls,
      username: http_optional_text(server, "username"),
      credential: http_optional_text(server, "credential"),
    }
  })
}

///|
pub fn decode_profile_response(text : String) -> UserProfile {
  try! checked_profile_response(text)
}

///|
pub fn decode_users_response(text : String) -> Array[User] {
  try! checked_users_response(text)
}

///|
pub fn decode_event_response(text : String) -> Event {
  try! checked_event_response(text)
}

///|
pub fn decode_memo_response(text : String) -> UserNotes {
  try! checked_memo_response(text)
}

///|
pub fn decode_token_response(text : String) -> String {
  try! checked_token_response(text)
}

///|
pub fn decode_signup_response(text : String) -> SignUpResult {
  try! checked_signup_response(text)
}

///|
pub fn decode_avatar_response(text : String) -> String {
  try! checked_avatar_response(text)
}

///|
pub fn decode_chat_response(text : String) -> String {
  try! checked_chat_response(text)
}

///|
pub fn decode_ice_servers(text : String) -> Array[IceServerDto] {
  try! checked_ice_servers(text)
}
