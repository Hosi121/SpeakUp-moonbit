///|
pub fn env(name : String, fallback? : String = "") -> String {
  @env.get_env_var(name).unwrap_or(fallback)
}

///|
fn field(v : Json, key : String) -> Json {
  match v {
    Object(o) => o.get_or_default(key, Json::null())
    _ => Json::null()
  }
}

///|
fn string(v : Json, key : String) -> String raise {
  match field(v, key) {
    String(s) => s
    _ => raise @api.Unavailable
  }
}

///|
pub fn now_millis() -> Double {
  c_now()
}

///|
fn datetime(ms : Double) -> String {
  @utf8.decode_lossy(c_datetime(ms))
}

///|
pub fn now() -> String {
  datetime(now_millis())
}

///|
pub fn public_url(value : String) -> String {
  if value == "" || value.has_prefix("https://") || value.has_prefix("http://") {
    value
  } else {
    env("PUBLIC_ORIGIN", fallback="http://localhost:8081") + value
  }
}

///|
fn digits(s : String) -> Int raise {
  guard !s.is_empty() && s.iter().all(c => c >= '0' && c <= '9') else {
    raise @api.Unavailable
  }
  let mut n = 0
  for c in s {
    n = n * 10 + c.to_int() - 48
  }
  n
}

///|
pub fn event_times(value : String) -> @api.EventTimes? {
  try {
    guard value.length() >= 19 &&
      value[4] == '-' &&
      value[7] == '-' &&
      (value[10] == 'T' || value[10] == ' ') &&
      value[13] == ':' &&
      value[16] == ':' else {
      return None
    }
    let y = digits(value[0:4].to_owned())
    let m = digits(value[5:7].to_owned())
    let d = digits(value[8:10].to_owned())
    let h = digits(value[11:13].to_owned())
    let min = digits(value[14:16].to_owned())
    let sec = digits(value[17:19].to_owned())
    guard y >= 100 &&
      m >= 1 &&
      m <= 12 &&
      d >= 1 &&
      d <= 31 &&
      h < 24 &&
      min < 60 &&
      sec < 60 else {
      return None
    }
    let mut pos = 19
    if pos < value.length() && value[pos] == '.' {
      pos += 1
      let start = pos
      while pos < value.length() && value[pos] >= '0' && value[pos] <= '9' {
        pos += 1
      }
      guard pos > start && pos - start <= 9 else { return None }
    }
    let suffix = value[pos:].to_owned()
    let offset = if suffix == "" || suffix == "Z" {
      0
    } else {
      guard suffix.length() == 6 &&
        (suffix[0] == '+' || suffix[0] == '-') &&
        suffix[3] == ':' else {
        return None
      }
      let oh = digits(suffix[1:3].to_owned())
      let om = digits(suffix[4:6].to_owned())
      guard oh < 24 && om < 60 else { return None }
      (oh * 60 + om) * (if suffix[0] == '+' { 1 } else { -1 })
    }
    let instant = c_date(y, m, d, h, min, sec)
    guard instant != -1 else { return None }
    let start = instant - offset.to_double() * 60000
    Some({ start: datetime(start), end: datetime(start + 1800000), })
  } catch {
    _ => None
  }
}

///|
pub fn decode_url(value : String, plus? : Bool = false) -> String raise {
  let input = @utf8.encode(value)
  let output : Array[Byte] = []
  let mut i = 0
  while i < input.length() {
    if input[i] == b'%' {
      guard i + 2 < input.length() else { raise @api.Unavailable }
      output.push((hex(input[i + 1]) * 16 + hex(input[i + 2])).to_byte())
      i += 3
    } else {
      output.push(if plus && input[i] == b'+' { b' ' } else { input[i] })
      i += 1
    }
  }
  @utf8.decode(Bytes::from_array(output))
}

///|
fn hex(c : Byte) -> Int raise {
  if c >= b'0' && c <= b'9' {
    c.to_int() - 48
  } else if c >= b'a' && c <= b'f' {
    c.to_int() - 87
  } else if c >= b'A' && c <= b'F' {
    c.to_int() - 55
  } else {
    raise @api.Unavailable
  }
}

///|
pub struct Runtime {
  priv pool : @sql.Database[
    @mysql.Value,
    @mysql.Row,
    @mysql.Command,
    @mysql.TransactionOptions,
  ]
  priv keys : Keys
  priv mut closed : Bool
}

///|
pub async fn initialize() -> Runtime {
  c_bootstrap()
  let k = c_keys(
    @utf8.encode(env("JWT_PRIVATE_KEY").replace_all(old="\\n", new="\n")),
    @utf8.encode(env("JWT_PUBLIC_KEY").replace_all(old="\\n", new="\n")),
    env("AUTH_MODE") == "development",
  )
  errdefer c_keys_close(k)
  if !c_keys_ready(k) &&
    (env("JWT_PRIVATE_KEY") != "" || env("JWT_PUBLIC_KEY") != "") {
    raise @api.Unavailable
  }
  let url = env("DATABASE_URL")
  guard url.has_prefix("mysql://") else { raise @api.Unavailable }
  let parts = url[8:].to_owned().split("@").to_array()
  guard parts.length() == 2 else { raise @api.Unavailable }
  let credentials = parts[0].split(":").to_array()
  let location = parts[1].split("/").to_array()
  guard credentials.length() == 2 &&
    location.length() == 2 &&
    !location[1].is_empty() &&
    !location[1].contains("?") else {
    raise @api.Unavailable
  }
  let address = location[0].split(":").to_array()
  guard address.length() <= 2 else { raise @api.Unavailable }
  let port = if address.length() == 2 {
    digits(address[1].to_owned())
  } else {
    3306
  }
  guard port > 0 && port <= 65535 else { raise @api.Unavailable }
  let pool = @mysql.Pool::new(
    host=address[0].to_owned(),
    user=decode_url(credentials[0].to_owned()),
    password=decode_url(credentials[1].to_owned()),
    database=decode_url(location[1].to_owned()),
    port~,
    ssl_ca=env("MYSQL_SSL_CA"),
    plugin_dir=env("MYSQL_PLUGIN_DIR"),
    charset="utf8mb4",
    time_zone="+00:00",
    found_rows=true,
  ).database()
  { pool, keys: k, closed: false, }
}

///|
pub fn Runtime::close(self : Self) -> Unit {
  if !self.closed {
    self.closed = true
    self.pool.close()
    c_keys_close(self.keys)
  }
}

///|
fn sql_statement(request : @api.Statement) -> @mysql.Statement {
  @mysql.statement(
    request.sql,
    params=request.params.map(fn(value) {
      match value {
        Null => @mysql.Null
        Text(s) => @mysql.Text(s)
        Number(n) => @mysql.Float(n)
        Boolean(b) => @mysql.Integer(if b { 1L } else { 0L })
      }
    }),
  )
}

///|
fn sql_number(n : Double) -> Double raise {
  guard @wire.is_safe_integer(n) else { raise @api.InvalidData }
  n
}

///|
fn sql_value(value : @mysql.Value) -> @api.SqlValue raise {
  match value {
    Null => Null
    Text(s) | Decimal(s) => Text(s)
    Float(n) => Number(n)
    Integer(n) => Number(sql_number(n.to_double()))
    Unsigned(n) => Number(sql_number(n.to_double()))
    Blob(_) => raise @api.InvalidData
  }
}

///|
async fn Runtime::database(
  self : Self,
  requests : Array[@api.Statement],
  transaction : Bool,
) -> @api.DbResult {
  guard !self.closed && !requests.is_empty() else { raise @api.Unavailable }
  let statements = requests.map(sql_statement)
  let result = try {
    if transaction {
      self.pool.with_transaction(@mysql.TransactionOptions::new(), async fn(
        tx,
      ) {
        let mut result = tx.run(statements[0].sql, params=statements[0].params)
        for i in 1..<statements.length() {
          result = tx.run(statements[i].sql, params=statements[i].params)
        }
        result
      })
    } else {
      self.pool.run(statements[0].sql, params=statements[0].params)
    }
  } catch {
    @mysql.ServerError(1062) => raise @api.Conflict
    _ => raise @api.Unavailable
  }
  if result.metadata.has_rows {
    Rows(
      result.rows.map(fn(row) raise {
        let values = Map([])
        for i, name in row.columns {
          guard values.get(name) is None else { raise @api.InvalidData }
          values[name] = sql_value(row.values[i])
        }
        @api.DbRow(values)
      }),
    )
  } else {
    Written({
      affected_rows: sql_number(result.metadata.affected_rows.to_double()),
      insert_id: sql_number(result.metadata.insert_id.to_double()),
    })
  }
}

///|
pub fn Runtime::host(self : Self) -> @api.Host {
  {
    database: {
      run: async fn(statement) { self.database([statement], false) },
      transaction: async fn(statements) { self.database(statements, true) },
    },
    authenticate,
    issue_token: fn(user) raise {
      guard !self.closed else { raise @api.Unavailable }
      issue_token(self.keys, user)
    },
    chat,
    now,
    now_millis,
    public_url,
    event_times,
  }
}

///|
fn base64url(data : Bytes) -> String {
  @base64.encode(data, padding=false)
  .replace_all(old="+", new="-")
  .replace_all(old="/", new="_")
}

///|
fn unbase64(value : String) -> Bytes raise {
  guard !value.is_empty() &&
    value
    .iter()
    .all(c => {
      (c >= 'A' && c <= 'Z') ||
      (c >= 'a' && c <= 'z') ||
      (c >= '0' && c <= '9') ||
      c == '-' ||
      c == '_'
    }) else {
    raise @api.Credentials
  }
  @base64.decode(
    value.replace_all(old="-", new="+").replace_all(old="_", new="/"),
  )
}

///|
fn verify_token(key : Keys, header : String) -> Int raise {
  let parts = header.split(" ").to_array()
  guard parts.length() == 2 && parts[0].to_owned().to_lower() == "bearer" else {
    raise @api.Credentials
  }
  let jwt = parts[1].split(".").to_array()
  guard jwt.length() == 3 else { raise @api.Credentials }
  let metadata = @json.parse(@utf8.decode(unbase64(jwt[0].to_owned())))
  guard metadata is Object(protected_header) &&
    field(metadata, "alg") == Json::string("RS256") &&
    protected_header.get("crit") is None &&
    protected_header.get("b64") is None else {
    raise @api.Credentials
  }
  guard c_verify(
    key,
    @utf8.encode(jwt[0].to_owned() + "." + jwt[1].to_owned()),
    unbase64(jwt[2].to_owned()),
  ) else {
    raise @api.Credentials
  }
  let payload = @json.parse(@utf8.decode(unbase64(jwt[1].to_owned())))
  guard field(payload, "iss") == Json::string("speakup") &&
    (match field(payload, "aud") {
      String(s) => s == "speakup"
      Array(a) => a.contains(Json::string("speakup"))
      _ => false
    }) else {
    raise @api.Credentials
  }
  let now = now_millis() / 1000
  guard field(payload, "exp") is Number(exp, ..) && exp > now else {
    raise @api.Credentials
  }
  guard payload is Object(claims) else { raise @api.Credentials }
  // Absence is allowed; explicit null or a string is not a NumericDate.
  match claims.get("nbf") {
    None => ()
    Some(Number(n, ..)) if n <= now => ()
    _ => raise @api.Credentials
  }
  match claims.get("iat") {
    None | Some(Number(_, ..)) => ()
    _ => raise @api.Credentials
  }
  let id = string(payload, "user_id")
  guard id.length() <= 10 &&
    !id.is_empty() &&
    !id.has_prefix("0") &&
    id.iter().all(c => c >= '0' && c <= '9') else {
    raise @api.Credentials
  }
  let n : Double = @json.from_json(@json.parse(id))
  guard n > 0 && n <= 2147483647 && n == n.to_int().to_double() else {
    raise @api.Credentials
  }
  n.to_int()
}

///|
fn issue_token(keys : Keys, uid : @identity.UserId) -> String raise {
  guard c_keys_ready(keys) else { raise @api.NotConfigured }
  let seconds = (now_millis() / 1000).to_int64().to_double()
  let payload : Json = {
    "user_id": uid.value().to_string().to_json(),
    "iss": "speakup",
    "aud": "speakup",
    "iat": seconds.to_json(),
    "exp": (seconds + 86400).to_json(),
  }
  let data = "eyJhbGciOiJSUzI1NiJ9." +
    base64url(@utf8.encode(payload.stringify()))
  let sig = c_sign(keys, @utf8.encode(data))
  guard !sig.is_empty() else { raise @api.Unavailable }
  data + "." + base64url(sig)
}

///|
pub fn rtc_config(uid : Int) -> Json {
  let servers : Array[Json] = [{ "urls": "stun:stun.l.google.com:19302" }]
  let urls = env("TURN_URLS")
  let secret = env("TURN_SECRET")
  if urls != "" && secret != "" {
    let username = "\{(now_millis() / 1000).to_int64() + 3600L}:\{uid}"
    servers.push({
      "urls": urls.split(",").map(s => s.to_owned()).to_array().to_json(),
      "username": username.to_json(),
      "credential": @base64.encode(
        c_hmac(@utf8.encode(secret), @utf8.encode(username)),
      ).to_json(),
    })
  }
  { "iceServers": servers.to_json() }
}

///|
pub fn random_name() -> String {
  c_random()
  .iter()
  .fold(init="", fn(s, b) {
    let alphabet = "0123456789abcdef"
    s +
    alphabet[b.to_int() / 16:b.to_int() / 16 + 1].to_owned() +
    alphabet[b.to_int() % 16:b.to_int() % 16 + 1].to_owned()
  })
}

///|
async fn authenticate(
  action : @api.AuthAction,
  credentials : @api.Credentials,
) -> Unit {
  let email = credentials.email
  let password = credentials.password
  if env("AUTH_MODE") == "development" {
    guard action is @api.SignIn &&
      (email == "alice@example.test" || email == "bob@example.test") &&
      password == "speakup-local-only" else {
      raise @api.Credentials
    }
  } else {
    let url = env("SUPABASE_URL")
    let key = env("SUPABASE_ANON_KEY")
    guard url != "" && key != "" else { raise @api.NotConfigured }
    let endpoint = if action is @api.SignUp {
      "signup"
    } else {
      "token?grant_type=password"
    }
    let (response, _) = @async.with_timeout(20000, async fn() {
      @http.post(
        url + "/auth/v1/" + endpoint,
        ({ "email": email.to_json(), "password": password.to_json() } : Json),
        headers=Map([
          (@http.CaseInsensitiveString("Content-Type"), "application/json"),
          (@http.CaseInsensitiveString("apikey"), key),
        ]),
      )
    })
    guard response.code >= 200 && response.code < 300 else {
      raise @api.Credentials
    }
  }
}

///|
async fn chat(kind : @api.ChatKind, content : String) -> @api.ChatReply {
  let key = env("OPENAI_API_KEY")
  guard key != "" else { raise @api.NotConfigured }
  let theme = kind is @api.Theme
  let prompt = if theme {
    "会話のテーマとしてふさわしいものを一つだけ返してください。"
  } else if kind is @api.Feedback {
    "本人が書いた振り返りと英語表現に、日本語で短い改善案と英語の例文を返してください。音声を聞いた・会話能力を評価したとは言わず、入力文だけを根拠にしてください。"
  } else {
    "英語についての質問に、日本語で英語の表現を教えてください。"
  }
  let body : Json = {
    "model": env("OPENAI_MODEL", fallback="gpt-4.1-mini").to_json(),
    "messages": [
      { "role": "system", "content": prompt.to_json() },
      { "role": "user", "content": content.to_json() },
    ],
    "max_tokens": (if theme { 100 } else { 1000 }).to_json(),
  }
  let (response, result) = @async.with_timeout(20000, async fn() {
    @http.post(
      env("OPENAI_BASE_URL", fallback="https://api.openai.com/v1") +
      "/chat/completions",
      body,
      headers=Map([
        (@http.CaseInsensitiveString("Content-Type"), "application/json"),
        (@http.CaseInsensitiveString("Authorization"), "Bearer " + key),
      ]),
    )
  })
  guard response.code >= 200 && response.code < 300 else {
    raise @api.Unavailable
  }
  @api.ChatReply::decode(result.json())
}

///|
pub fn Runtime::verify_token(self : Self, header : String) -> Int raise {
  guard !self.closed else { raise @api.Unavailable }
  verify_token(self.keys, header)
}
