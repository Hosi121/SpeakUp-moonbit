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
    _ => raise @api.HostError("upstream")
  }
}

///|
fn array(v : Json, key : String) -> Array[Json] raise {
  match field(v, key) {
    Array(a) => a
    _ => raise @api.HostError("upstream")
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
    raise @api.HostError("upstream")
  }
  let mut n = 0
  for c in s {
    n = n * 10 + c.to_int() - 48
  }
  n
}

///|
pub fn event_times(value : String) -> String {
  try {
    guard value.length() >= 19 &&
      value[4] == '-' &&
      value[7] == '-' &&
      (value[10] == 'T' || value[10] == ' ') &&
      value[13] == ':' &&
      value[16] == ':' else {
      return ""
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
      return ""
    }
    let mut pos = 19
    if pos < value.length() && value[pos] == '.' {
      pos += 1
      let start = pos
      while pos < value.length() && value[pos] >= '0' && value[pos] <= '9' {
        pos += 1
      }
      guard pos > start && pos - start <= 9 else { return "" }
    }
    let suffix = value[pos:].to_owned()
    let offset = if suffix == "" || suffix == "Z" {
      0
    } else {
      guard suffix.length() == 6 &&
        (suffix[0] == '+' || suffix[0] == '-') &&
        suffix[3] == ':' else {
        return ""
      }
      let oh = digits(suffix[1:3].to_owned())
      let om = digits(suffix[4:6].to_owned())
      guard oh < 24 && om < 60 else { return "" }
      (oh * 60 + om) * (if suffix[0] == '+' { 1 } else { -1 })
    }
    let instant = c_date(y, m, d, h, min, sec)
    guard instant != -1 else { return "" }
    let start = instant - offset.to_double() * 60000
    (
      {
        "start": datetime(start).to_json(),
        "end": datetime(start + 1800000).to_json(),
      } : Json).stringify()
  } catch {
    _ => ""
  }
}

///|
pub fn decode_url(value : String, plus? : Bool = false) -> String raise {
  let input = @utf8.encode(value)
  let output : Array[Byte] = []
  let mut i = 0
  while i < input.length() {
    if input[i] == b'%' {
      guard i + 2 < input.length() else { raise @api.HostError("upstream") }
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
    raise @api.HostError("upstream")
  }
}

///|
let database_pool : Ref[
  @sql.Database[
    @mysql.Value,
    @mysql.Row,
    @mysql.Command,
    @mysql.TransactionOptions,
  ]?,
] = { val: None, }

///|
let key_store : Ref[Keys?] = { val: None, }

///|
pub async fn initialize() -> Unit {
  c_bootstrap()
  let k = c_keys(
    @utf8.encode(env("JWT_PRIVATE_KEY").replace_all(old="\\n", new="\n")),
    @utf8.encode(env("JWT_PUBLIC_KEY").replace_all(old="\\n", new="\n")),
    env("AUTH_MODE") == "development",
  )
  key_store.val = Some(k)
  if !c_keys_ready(k) &&
    (env("JWT_PRIVATE_KEY") != "" || env("JWT_PUBLIC_KEY") != "") {
    raise @api.HostError("Invalid RSA keys")
  }
  let url = env("DATABASE_URL")
  guard url.has_prefix("mysql://") else {
    raise @api.HostError("DATABASE_URL must use mysql://")
  }
  let parts = url[8:].to_owned().split("@").to_array()
  guard parts.length() == 2 else {
    raise @api.HostError("Invalid DATABASE_URL")
  }
  let credentials = parts[0].split(":").to_array()
  let location = parts[1].split("/").to_array()
  guard credentials.length() == 2 &&
    location.length() == 2 &&
    !location[1].is_empty() &&
    !location[1].contains("?") else {
    raise @api.HostError("Invalid DATABASE_URL")
  }
  let address = location[0].split(":").to_array()
  guard address.length() <= 2 else {
    raise @api.HostError("Use a DNS name or IPv4 database address")
  }
  let port = if address.length() == 2 {
    digits(address[1].to_owned())
  } else {
    3306
  }
  guard port > 0 && port <= 65535 else {
    raise @api.HostError("Invalid database port")
  }
  database_pool.val = Some(
    @mysql.Pool::new(
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
    ).database(),
  )
  @api.configure_host({ invoke, now, now_millis, public_url, event_times, })
}

///|
pub fn close() -> Unit {
  if database_pool.val is Some(pool) {
    pool.close()
    database_pool.val = None
  }
  if key_store.val is Some(k) {
    c_keys_close(k)
    key_store.val = None
  }
}

///|
fn sql_statement(request : Json) -> @mysql.Statement raise {
  @mysql.statement(
    string(request, "sql"),
    params=array(request, "params").map(fn(value) raise {
      match value {
        Null => @mysql.Null
        String(s) => @mysql.Text(s)
        Number(n, ..) => @mysql.Float(n)
        True => @mysql.Integer(1L)
        False => @mysql.Integer(0L)
        _ => raise @api.HostError("upstream")
      }
    }),
  )
}

///|
fn sql_number(n : Double) -> Json raise {
  guard @wire.is_safe_integer(n) else { raise @api.HostError("upstream") }
  n.to_json()
}

///|
fn sql_json(value : @mysql.Value) -> Json raise {
  match value {
    Null => Json::null()
    Text(s) | Decimal(s) => s.to_json()
    Float(n) => n.to_json()
    Integer(n) => sql_number(n.to_double())
    Unsigned(n) => sql_number(n.to_double())
    Blob(_) => raise @api.HostError("upstream")
  }
}

///|
async fn database(request : Json, transaction : Bool) -> Json {
  guard database_pool.val is Some(pool) else {
    raise @api.HostError("upstream")
  }
  let result = try {
    if transaction {
      let statements = array(request, "statements").map(sql_statement)
      guard !statements.is_empty() else { raise @api.HostError("upstream") }
      pool.with_transaction(@mysql.TransactionOptions::new(), async fn(tx) {
        let mut result = tx.run(statements[0].sql, params=statements[0].params)
        for i in 1..<statements.length() {
          result = tx.run(statements[i].sql, params=statements[i].params)
        }
        result
      })
    } else {
      let statement = sql_statement(request)
      pool.run(statement.sql, params=statement.params)
    }
  } catch {
    @mysql.ServerError(1062) => raise @api.HostError("conflict")
    _ => raise @api.HostError("upstream")
  }
  if result.metadata.has_rows {
    result.rows
    .map(fn(row) raise {
      let values : Map[String, Json] = Map([])
      for i, name in row.columns {
        // The JSON API cannot represent duplicate keys. Reject them explicitly.
        guard values.get(name) is None else { raise @api.HostError("upstream") }
        values[name] = sql_json(row.values[i])
      }
      values.to_json()
    })
    .to_json()
  } else {
    {
      "affectedRows": sql_number(result.metadata.affected_rows.to_double()),
      "insertId": sql_number(result.metadata.insert_id.to_double()),
    }
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
    raise @api.HostError("credentials")
  }
  @base64.decode(
    value.replace_all(old="-", new="+").replace_all(old="_", new="/"),
  )
}

///|
pub fn verify_token(header : String) -> Int raise {
  let parts = header.split(" ").to_array()
  guard parts.length() == 2 && parts[0].to_owned().to_lower() == "bearer" else {
    raise @api.HostError("credentials")
  }
  let jwt = parts[1].split(".").to_array()
  guard jwt.length() == 3 else { raise @api.HostError("credentials") }
  let key = key_store.val.unwrap()
  let metadata = @json.parse(@utf8.decode(unbase64(jwt[0].to_owned())))
  guard metadata is Object(protected_header) &&
    field(metadata, "alg") == Json::string("RS256") &&
    protected_header.get("crit") is None &&
    protected_header.get("b64") is None else {
    raise @api.HostError("credentials")
  }
  guard c_verify(
    key,
    @utf8.encode(jwt[0].to_owned() + "." + jwt[1].to_owned()),
    unbase64(jwt[2].to_owned()),
  ) else {
    raise @api.HostError("credentials")
  }
  let payload = @json.parse(@utf8.decode(unbase64(jwt[1].to_owned())))
  guard field(payload, "iss") == Json::string("speakup") &&
    (match field(payload, "aud") {
      String(s) => s == "speakup"
      Array(a) => a.contains(Json::string("speakup"))
      _ => false
    }) else {
    raise @api.HostError("credentials")
  }
  let now = now_millis() / 1000
  guard field(payload, "exp") is Number(exp, ..) && exp > now else {
    raise @api.HostError("credentials")
  }
  guard payload is Object(claims) else { raise @api.HostError("credentials") }
  // Absence is allowed; explicit null or a string is not a NumericDate.
  match claims.get("nbf") {
    None => ()
    Some(Number(n, ..)) if n <= now => ()
    _ => raise @api.HostError("credentials")
  }
  match claims.get("iat") {
    None | Some(Number(_, ..)) => ()
    _ => raise @api.HostError("credentials")
  }
  let id = string(payload, "user_id")
  guard id.length() <= 10 &&
    !id.is_empty() &&
    !id.has_prefix("0") &&
    id.iter().all(c => c >= '0' && c <= '9') else {
    raise @api.HostError("credentials")
  }
  let n : Double = @json.from_json(@json.parse(id))
  guard n > 0 && n <= 2147483647 && n == n.to_int().to_double() else {
    raise @api.HostError("credentials")
  }
  n.to_int()
}

///|
fn issue_token(uid : Json) -> Json raise {
  let keys = key_store.val.unwrap()
  guard c_keys_ready(keys) else { raise @api.HostError("not_configured") }
  guard uid is Number(id, ..) &&
    id >= 1 &&
    id <= 2147483647 &&
    id == id.to_int().to_double() else {
    raise @api.HostError("upstream")
  }
  let seconds = (now_millis() / 1000).to_int64().to_double()
  let payload : Json = {
    "user_id": id.to_int().to_string().to_json(),
    "iss": "speakup",
    "aud": "speakup",
    "iat": seconds.to_json(),
    "exp": (seconds + 86400).to_json(),
  }
  let data = "eyJhbGciOiJSUzI1NiJ9." +
    base64url(@utf8.encode(payload.stringify()))
  let sig = c_sign(keys, @utf8.encode(data))
  guard !sig.is_empty() else { raise @api.HostError("upstream") }
  (data + "." + base64url(sig)).to_json()
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
pub async fn invoke(request : Json) -> Json {
  let operation = string(request, "operation")
  match operation {
    "database" => database(request, false)
    "transaction" => database(request, true)
    "issue_token" => issue_token(field(request, "user_id"))
    "signin" | "signup" => {
      let email = string(request, "email")
      let password = string(request, "password")
      if env("AUTH_MODE") == "development" {
        guard operation == "signin" &&
          (email == "alice@example.test" || email == "bob@example.test") &&
          password == "speakup-local-only" else {
          raise @api.HostError("credentials")
        }
      } else {
        let url = env("SUPABASE_URL")
        let key = env("SUPABASE_ANON_KEY")
        guard url != "" && key != "" else {
          raise @api.HostError("not_configured")
        }
        let endpoint = if operation == "signup" {
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
          raise @api.HostError("credentials")
        }
      }
      { "success": true }
    }
    "chat" => {
      let key = env("OPENAI_API_KEY")
      guard key != "" else { raise @api.HostError("not_configured") }
      let theme = string(request, "kind") == "/chat/theme"
      let prompt = if theme {
        "会話のテーマとしてふさわしいものを一つだけ返してください。"
      } else if string(request, "kind") == "/chat/feedback" {
        "本人が書いた振り返りと英語表現に、日本語で短い改善案と英語の例文を返してください。音声を聞いた・会話能力を評価したとは言わず、入力文だけを根拠にしてください。"
      } else {
        "英語についての質問に、日本語で英語の表現を教えてください。"
      }
      let body : Json = {
        "model": env("OPENAI_MODEL", fallback="gpt-4.1-mini").to_json(),
        "messages": [
          { "role": "system", "content": prompt.to_json() },
          { "role": "user", "content": string(request, "content").to_json() },
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
        raise @api.HostError("upstream")
      }
      result.json()
    }
    _ => raise @api.HostError("upstream")
  }
}
