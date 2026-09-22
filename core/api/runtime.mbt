///|
priv suberror ApiError {
  Invalid(Int, String)
  Upstream(String)
}

///|
pub(all) suberror HostError {
  HostError(String)
}

///|
pub(all) struct Host {
  invoke : async (Json) -> Json
  now : () -> String
  now_millis : () -> Double
  public_url : (String) -> String
  event_times : (String) -> String
}

///|
let configured_host : Ref[Host?] = { val: None, }

///|
pub fn configure_host(value : Host) -> Unit {
  configured_host.val = Some(value)
}

///|
fn host() -> Host {
  configured_host.val.unwrap()
}

///|
async fn invoke(request : Json) -> Json {
  (host().invoke)(request) catch {
    HostError(code) => raise Upstream(code)
    e => raise e
  }
}

///|
async fn query(sql : String, params : Array[Json]) -> Json {
  invoke({
    "operation": "database",
    "sql": sql.to_json(),
    "params": params.to_json(),
  })
}

///|
async fn rows(sql : String, params : Array[Json]) -> Array[Json] {
  match query(sql, params) {
    Array(xs) => xs
    _ => raise Upstream("invalid database result")
  }
}

///|
async fn one(sql : String, params : Array[Json]) -> Json {
  let xs = rows(sql, params)
  if xs.length() == 0 {
    raise Invalid(404, "Not found")
  }
  xs[0]
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
fn profile(v : Json) -> @shared.UserProfileDto raise {
  let p : @shared.UserProfileDto = @json.from_json(v)
  {
    ..p,
    avatar_url: (host().public_url)(p.avatar_url),
    created_at: iso(p.created_at),
    updated_at: iso(p.updated_at),
  }
}

///|
fn user(v : Json) -> @shared.UserDto raise {
  let p = profile(v)
  {
    id: p.id,
    username: p.username,
    email: p.email,
    avatar_url: p.avatar_url,
    created_at: p.created_at,
  }
}

///|
fn event(v : Json) -> @shared.EventDto raise {
  {
    id: number(v, "id"),
    event_start: iso(string(v, "event_start")),
    event_end: iso(string(v, "event_end")),
    theme_id: number(v, "theme_id"),
    theme: {
      theme_text: string(v, "theme_text"),
      topic1: string(v, "topic1"),
      topic2: string(v, "topic2"),
      topic3: string(v, "topic3"),
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
pub async fn execute(
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
    let result = route(verb, path, uid, value, query_text)
    response(200, result.stringify())
  } catch {
    Invalid(code, message) =>
      response(code, ({ "error": message.to_json() } : Json).stringify())
    Upstream("credentials") =>
      response(401, "{\"error\":\"Invalid email or password\"}")
    Upstream("not_configured") =>
      response(503, "{\"error\":\"External service is not configured\"}")
    Upstream("conflict") => response(409, "{\"error\":\"Already exists\"}")
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
