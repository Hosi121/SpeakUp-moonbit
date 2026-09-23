///|
priv suberror ApiError {
  Invalid(Int, String)
}

///|
async fn Api::query(
  self : Self,
  sql : String,
  params : Array[SqlValue],
) -> DbResult {
  (self.host.database.run)({ sql, params, })
}

///|
async fn Api::transaction(
  self : Self,
  statements : Array[Statement],
) -> DbResult {
  (self.host.database.transaction)(statements)
}

///|
async fn Api::rows(
  self : Self,
  sql : String,
  params : Array[SqlValue],
) -> Array[DbRow] {
  self.query(sql, params).rows()
}

///|
async fn Api::one(self : Self, sql : String, params : Array[SqlValue]) -> DbRow {
  let xs = self.rows(sql, params)
  guard xs.get(0) is Some(row) else { raise Invalid(404, "Not found") }
  row
}

///|
fn field(v : Json, key : String) -> Json {
  match v {
    Object(o) => o.get_or_default(key, Json::null())
    _ => Json::null()
  }
}

///|
fn string(v : Json, key : String) -> String raise ApiError {
  match field(v, key) {
    String(s) => s
    Null => ""
    _ => raise Invalid(400, "Invalid " + key)
  }
}

///|
fn required(v : Json, key : String, limit : Int) -> String raise ApiError {
  let s = string(v, key)
  if s.length() == 0 || s.length() > limit {
    raise Invalid(400, "Invalid " + key)
  }
  s
}

///|
fn number(v : Json, key : String) -> Int raise ApiError {
  match field(v, key) {
    Number(n, ..) =>
      if n >= 1 && n <= 2147483647 && n == n.to_int().to_double() {
        n.to_int()
      } else {
        raise Invalid(400, "Invalid " + key)
      }
    _ => raise Invalid(400, "Invalid " + key)
  }
}

///|
fn path_id(s : String) -> Int raise ApiError {
  if s.is_empty() ||
    s.has_prefix("0") ||
    s.length() > 10 ||
    !s.iter().all(fn(c) { c >= '0' && c <= '9' }) {
    raise Invalid(400, "Invalid ID")
  }
  let value = @json.parse(s) catch { _ => raise Invalid(400, "Invalid ID") }
  number({ "id": value }, "id")
}

///|
fn Api::profile(self : Self, v : DbRow) -> @shared.UserProfileDto raise {
  let p : @shared.UserProfileDto = v.decode()
  {
    ..p,
    avatar_url: (self.host.public_url)(p.avatar_url),
    created_at: iso(p.created_at),
    updated_at: iso(p.updated_at),
  }
}

///|
fn Api::user(self : Self, v : DbRow) -> @shared.UserDto raise {
  let p = self.profile(v)
  {
    id: p.id,
    username: p.username,
    email: p.email,
    avatar_url: p.avatar_url,
    created_at: p.created_at,
  }
}

///|
fn event(v : DbRow) -> @shared.EventDto raise {
  {
    id: v.id("id"),
    event_start: iso(v.text("event_start")),
    event_end: iso(v.text("event_end")),
    theme_id: v.id("theme_id"),
    theme: {
      theme_text: v.text("theme_text"),
      topic1: v.text("topic1"),
      topic2: v.text("topic2"),
      topic3: v.text("topic3"),
    },
  }
}

///|
fn iso(s : String) -> String {
  if s.contains(" ") {
    s.replace(old=" ", new="T") + "Z"
  } else {
    s
  }
}

///|
let user_columns : String = "id, username, email, avatar_url, role, created_at, updated_at"

///|
let event_sql : String = "SELECT e.id, e.event_start, e.event_end, e.theme_id, t.theme_text, t.topic1, t.topic2, t.topic3 FROM events e JOIN ai_themes t ON t.id=e.theme_id"

///|
pub(all) struct ApiResponse {
  status : Int
  body : String
}

///|
fn response(status : Int, body : String) -> ApiResponse {
  { status, body, }
}

///|
pub async fn Api::execute(
  self : Self,
  verb : String,
  path : String,
  uid : Int,
  body : String,
  query_text : String,
) -> ApiResponse {
  try {
    let value = if body == "" {
      Json::empty_object()
    } else {
      @json.parse(body) catch {
        _ => raise Invalid(400, "Invalid JSON")
      }
    }
    guard value is Object(_) else { raise Invalid(400, "Expected object") }
    let result = self.route(verb, path, uid, value, query_text)
    response(200, result.stringify())
  } catch {
    Invalid(code, message) =>
      response(code, ({ "error": message.to_json() } : Json).stringify())
    HostError::Credentials =>
      response(401, "{\"error\":\"Invalid email or password\"}")
    HostError::NotConfigured =>
      response(503, "{\"error\":\"External service is not configured\"}")
    HostError::Conflict => response(409, "{\"error\":\"Already exists\"}")
    @conversation.NotParticipant =>
      response(403, "{\"error\":\"Not a participant\"}")
    @conversation.NotStarted =>
      response(409, "{\"error\":\"Both participants must connect first\"}")
    @conversation.AlreadyCompleted =>
      response(409, "{\"error\":\"Conversation already completed\"}")
    @conversation.AlreadyStarted =>
      response(
        409, "{\"error\":\"Conversation already started; finish it instead\"}",
      )
    _ => response(500, "{\"error\":\"Request failed\"}")
  }
}

///|
fn path_user(value : String) -> @identity.UserId raise {
  @identity.UserId::from_int(path_id(value))
}

///|
fn path_conversation(value : String) -> @identity.ConversationId raise {
  @identity.ConversationId::from_int(path_id(value))
}
