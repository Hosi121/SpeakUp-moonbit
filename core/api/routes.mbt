///|
async fn route(
  verb : String,
  path : String,
  uid : Int,
  body : Json,
  search : String,
) -> Json {
  if verb == "GET" && path == "/health" {
    return { "status": "ok", "runtime": "moonbit-js" }
  }
  if verb == "POST" && (path == "/signup" || path == "/signin") {
    let email = required(body, "email", 255)
    let password = required(body, "password", 1024)
    let username = if path == "/signup" {
      required(body, "username", 255)
    } else {
      ""
    }
    invoke({
      "operation": (if path == "/signup" { "signup" } else { "signin" }).to_json(),
      "email": email.to_json(),
      "password": password.to_json(),
    })
    |> ignore
    if path == "/signup" {
      query("INSERT INTO users (username,email) VALUES (?,?)", [
        username.to_json(),
        email.to_json(),
      ])
      |> ignore
      return { "success": true, "message": "User signed up successfully" }
    }
    let u = one(
      "SELECT " + user_columns + " FROM users WHERE email=? AND is_deleted=0",
      [email.to_json()],
    )
    let id = number(u, "id")
    let token = invoke({ "operation": "issue_token", "user_id": id.to_json() })
    query("UPDATE users SET updated_at=? WHERE id=?", [
      @platform.now().to_json(),
      id.to_json(),
    ])
    |> ignore
    return {
      "token": token,
      "accessToken": token,
      "user": {
        "id": id.to_string().to_json(),
        "email": email.to_json(),
        "username": string(u, "username").to_json(),
      },
    }
  }
  if uid <= 0 {
    raise Invalid(401, "Authentication required")
  }
  let me = one(
    "SELECT " + user_columns + " FROM users WHERE id=? AND is_deleted=0",
    [uid.to_json()],
  )
  let params = [uid.to_json()]
  match (verb, path) {
    ("GET", "/user/info") => return profile(me).to_json()
    ("PUT", "/user/update") => {
      let username = string(body, "username")
      let email = string(body, "email")
      if username.length() > 255 || email.length() > 255 {
        raise Invalid(400, "Value too long")
      }
      query(
        "UPDATE users SET username=COALESCE(NULLIF(?,''),username), email=COALESCE(NULLIF(?,''),email), updated_at=? WHERE id=?",
        [
          username.to_json(),
          email.to_json(),
          @platform.now().to_json(),
          uid.to_json(),
        ],
      )
      |> ignore
      return { "message": "User updated successfully" }
    }
    ("PUT", "/user/avatar") => {
      // The transport supplies the path only after a bounded, verified upload.
      let avatar = required(body, "avatar_url", 255)
      if !avatar.has_prefix("/upload/") {
        raise Invalid(400, "Invalid avatar")
      }
      query("UPDATE users SET avatar_url=?,updated_at=? WHERE id=?", [
        avatar.to_json(),
        @platform.now().to_json(),
        uid.to_json(),
      ])
      |> ignore
      return { "avatar_url": @platform.publicUrl(avatar).to_json() }
    }
    ("GET", "/memo") => {
      let result = rows("SELECT memo1,memo2 FROM memos WHERE user_id=?", params)
      if result.is_empty() {
        return @shared.MemoDto::{ memo1: "", memo2: "", }.to_json()
      }
      let memo : @shared.MemoDto = @json.from_json(result[0])
      return memo.to_json()
    }
    ("PUT", "/memo") => {
      let memo : @shared.MemoDto = {
        memo1: string(body, "memo1"),
        memo2: string(body, "memo2"),
      }
      if memo.memo1.length() > 255 || memo.memo2.length() > 255 {
        raise Invalid(400, "Memo exceeds 255 characters")
      }
      query(
        "INSERT INTO memos (user_id,memo1,memo2) VALUES (?,?,?) ON DUPLICATE KEY UPDATE memo1=VALUES(memo1),memo2=VALUES(memo2)",
        [uid.to_json(), memo.memo1.to_json(), memo.memo2.to_json()],
      )
      |> ignore
      return memo.to_json()
    }
    ("GET", "/users/search") => {
      if search == "" {
        raise Invalid(400, "Search query is required")
      }
      let result = rows(
        "SELECT " +
        user_columns +
        " FROM users WHERE is_deleted=0 AND LOCATE(?,username)>0 ORDER BY id LIMIT 10",
        [search.to_json()],
      )
      return result.map(fn(v) raise { user(v).to_json() }).to_json()
    }
    ("GET", "/friend/me") => {
      let result = rows(
        "SELECT u.id,u.username,u.avatar_url FROM friends f JOIN users u ON u.id=f.target_user_id WHERE f.user_id=? AND f.status='FRIEND' AND u.is_deleted=0 ORDER BY u.id",
        params,
      )
      return {
        "friends": result
        .map(fn(v) raise {
          let f : @shared.FriendSummaryDto = @json.from_json(v)
          { ..f, avatar_url: @platform.publicUrl(f.avatar_url), }.to_json()
        })
        .to_json(),
      }
    }
    ("POST", "/friend/register") => {
      let other = number(body, "target_user_id")
      if other == uid {
        raise Invalid(400, "Cannot add yourself")
      }
      one("SELECT id FROM users WHERE id=? AND is_deleted=0", [other.to_json()])
      |> ignore
      query(
        "INSERT INTO friends (user_id,target_user_id,status) VALUES (?,?,'FRIEND') ON DUPLICATE KEY UPDATE status='FRIEND'",
        [uid.to_json(), other.to_json()],
      )
      |> ignore
      return { "message": "Friend added successfully" }
    }
    ("GET", "/events") =>
      return rows(event_sql + " ORDER BY e.event_start DESC,e.id DESC", [])
        .map(fn(v) raise { event(v).to_json() })
        .to_json()
    ("POST", "/events") => {
      if string(me, "role") == "USER" {
        raise Invalid(403, "Administrator required")
      }
      let start = string(body, "event_start")
      let times = @platform.eventTimes(
        if start == "" {
          string(body, "dateTime")
        } else {
          start
        },
      )
      if times == "" {
        raise Invalid(400, "Invalid date time format")
      }
      let t = @json.parse(times)
      let theme = required(body, "theme", 1000)
      let topics : Array[String] = @json.from_json(field(body, "topics")) catch {
        _ => raise Invalid(400, "Invalid topics")
      }
      if topics.length() > 3 || topics.any(fn(s) { s.length() > 1000 }) {
        raise Invalid(400, "Invalid topics")
      }
      let statements : Json = [
        {
          "sql": "INSERT INTO ai_themes (theme_text,topic1,topic2,topic3) VALUES (?,?,?,?)",
          "params": [
            theme.to_json(),
            topics.get(0).unwrap_or("").to_json(),
            topics.get(1).unwrap_or("").to_json(),
            topics.get(2).unwrap_or("").to_json(),
          ],
        },
        {
          "sql": "INSERT INTO events (event_start,event_end,theme_id) VALUES (?,?,LAST_INSERT_ID())",
          "params": [field(t, "start"), field(t, "end")],
        },
        {
          "sql": (event_sql + " WHERE e.id=LAST_INSERT_ID()").to_json(),
          "params": [],
        },
      ]
      let result = invoke({
        "operation": "transaction",
        "statements": statements,
      })
      match result {
        Array(xs) => return event(xs[0]).to_json()
        _ => raise Upstream("invalid event")
      }
    }
    ("POST", "/chat/ask") | ("POST", "/chat/theme") => {
      let content = required(body, "content", 4000)
      return invoke({
        "operation": "chat",
        "kind": path.to_json(),
        "content": content.to_json(),
      })
    }
    ("GET", "/rooms") =>
      return rows(
        "SELECT id,user_a,user_b,event_id,round FROM rooms WHERE (user_a=? OR user_b=?) AND status='MATCHED' ORDER BY id",
        [uid.to_json(), uid.to_json()],
      ).to_json()
    ("GET", "/topics") =>
      return rows(
          "SELECT theme_text AS theme,topic1,topic2,topic3 FROM ai_themes ORDER BY id DESC",
          [],
        )
        .map(fn(v) {
          (
            {
              "theme": field(v, "theme"),
              "topics": [
                field(v, "topic1"),
                field(v, "topic2"),
                field(v, "topic3"),
              ],
            } : Json)
        })
        .to_json()
    ("GET", "/sessions") =>
      return rows(
          "SELECT e.event_start AS date_time,t.theme_text AS theme FROM event_records r JOIN events e ON e.id=r.event_id JOIN ai_themes t ON t.id=e.theme_id WHERE r.user_id=? ORDER BY e.event_start DESC",
          params,
        )
        .map(fn(v) {
          (
            {
              "theme": field(v, "theme"),
              "date_time": field(v, "date_time"),
              "sessions": [1, 2, 3],
            } : Json)
        })
        .to_json()
    ("GET", "/session_history") =>
      return rows(
        "SELECT u.avatar_url AS avatar,u.username AS user,t.theme_text AS theme,e.event_start AS date,u.rank,'unapplied' AS friend_state FROM rooms r JOIN users u ON u.id=IF(r.user_a=?,r.user_b,r.user_a) JOIN events e ON e.id=r.event_id JOIN ai_themes t ON t.id=e.theme_id WHERE (r.user_a=? OR r.user_b=?) AND r.status='FINISHED' ORDER BY r.id DESC",
        [uid.to_json(), uid.to_json(), uid.to_json()],
      ).to_json()
    _ => ()
  }
  let segments = path.split("/").map(fn(s) { s.to_owned() }).collect()
  match (verb, segments) {
    ("POST", ["", "events", event_id, "register"]) => {
      let id = path_id(event_id)
      let bit = match field(body, "participates_bit") {
        Number(n, ..) =>
          if n >= 0 && n <= 7 && n == n.to_int().to_double() {
            n.to_int()
          } else {
            raise Invalid(400, "Invalid participation")
          }
        _ => raise Invalid(400, "Invalid participation")
      }
      one("SELECT id FROM events WHERE id=?", [id.to_json()]) |> ignore
      // Lock the event row in the same transaction used by the matching writer.
      let statements : Json = [
        {
          "sql": "SELECT id FROM events WHERE id=? FOR UPDATE",
          "params": [id.to_json()],
        },
        {
          "sql": "INSERT INTO event_records(event_id,user_id,participates_bit) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM event_match_runs WHERE event_id=?) ON DUPLICATE KEY UPDATE participates_bit=IF(EXISTS(SELECT 1 FROM event_match_runs WHERE event_id=?),participates_bit,VALUES(participates_bit))",
          "params": [
            id.to_json(),
            uid.to_json(),
            bit.to_json(),
            id.to_json(),
            id.to_json(),
          ],
        },
        {
          "sql": "SELECT participates_bit FROM event_records WHERE event_id=? AND user_id=?",
          "params": [id.to_json(), uid.to_json()],
        },
      ]
      let saved = invoke({
        "operation": "transaction",
        "statements": statements,
      })
      match saved {
        Array([row]) =>
          if field(row, "participates_bit") == bit.to_json() {
            return { "message": "Participation saved" }
          } else {
            raise Invalid(409, "Matching already started")
          }
        _ => raise Invalid(409, "Matching already started")
      }
    }
    ("POST", ["", "events", event_id, "match"]) => {
      if string(me, "role") == "USER" {
        raise Invalid(403, "Administrator required")
      }
      let id = path_id(event_id)
      one("SELECT id FROM events WHERE id=?", [id.to_json()]) |> ignore
      // A transaction reserves this event and snapshots its roster. Later
      // registrations cannot change it. Failed publication can be retried.
      let snapshot = invoke({
        "operation": "transaction",
        "statements": [
          {
            "sql": "SELECT id FROM events WHERE id=? FOR UPDATE",
            "params": [id.to_json()],
          },
          {
            "sql": "INSERT IGNORE INTO event_match_runs(event_id) VALUES (?)",
            "params": [id.to_json()],
          },
          {
            "sql": "SELECT r.user_id,u.rank,r.participates_bit FROM event_records r JOIN users u ON u.id=r.user_id WHERE r.event_id=? AND u.is_deleted=0 ORDER BY u.rank,r.id",
            "params": [id.to_json()],
          },
        ],
      })
      let roster : Array[@matching.Participant] = @json.from_json(snapshot)
      let statements : Array[Json] = [
        {
          "sql": "SELECT id FROM events WHERE id=? FOR UPDATE",
          "params": [id.to_json()],
        },
      ]
      for round in 1..<=3 {
        for pair in @matching.pair_round(roster, round, 0) {
          statements.push({
            "sql": "INSERT INTO rooms(event_id,round,user_a,user_b) VALUES (?,?,?,?)",
            "params": [
              id.to_json(),
              round.to_json(),
              pair.first.to_json(),
              pair.second.to_json(),
            ],
          })
        }
      }
      statements.push({
        "sql": "SELECT id,user_a,user_b,event_id,round FROM rooms WHERE event_id=? ORDER BY round,id",
        "params": [id.to_json()],
      })
      return invoke({
        "operation": "transaction",
        "statements": statements.to_json(),
      })
    }
    ("GET", ["", "users", "search", "id", id]) =>
      return user(
        one(
          "SELECT " + user_columns + " FROM users WHERE id=? AND is_deleted=0",
          [path_id(id).to_json()],
        ),
      ).to_json()
    ("GET", ["", "users", id, "avatar"]) => {
      let u = one("SELECT avatar_url FROM users WHERE id=? AND is_deleted=0", [
        path_id(id).to_json(),
      ])
      let avatar = string(u, "avatar_url")
      if avatar == "" {
        raise Invalid(404, "User has no avatar")
      }
      return { "avatar_url": @platform.publicUrl(avatar).to_json() }
    }
    ("GET", ["", "friend", name]) => {
      let f : @shared.FriendSummaryDto = @json.from_json(
        one(
          "SELECT u.id,u.username,u.avatar_url FROM friends f JOIN users u ON u.id=f.target_user_id WHERE f.user_id=? AND u.username=? AND f.status='FRIEND'",
          [uid.to_json(), name.to_json()],
        ),
      )
      return { ..f, avatar_url: @platform.publicUrl(f.avatar_url), }.to_json()
    }
    _ => raise Invalid(404, "Not found")
  }
}
