///|
async fn Api::route(
  self : Self,
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
    (self.host.authenticate)(if path == "/signup" { SignUp } else { SignIn }, {
      email,
      password,
    })
    if path == "/signup" {
      self.query("INSERT INTO users (username,email) VALUES (?,?)", [
        username.to_sql(),
        email.to_sql(),
      ])
      |> ignore
      return { "success": true, "message": "User signed up successfully" }
    }
    let u = self.one(
      "SELECT " + user_columns + " FROM users WHERE email=? AND is_deleted=0",
      [email.to_sql()],
    )
    let id = u.id("id")
    let token = (self.host.issue_token)(@identity.UserId::from_int(id))
    self.query("UPDATE users SET updated_at=? WHERE id=?", [
      (self.host.now)().to_sql(),
      id.to_sql(),
    ])
    |> ignore
    return {
      "token": token.to_json(),
      "accessToken": token.to_json(),
      "user": {
        "id": id.to_string().to_json(),
        "email": email.to_json(),
        "username": u.text("username").to_json(),
      },
    }
  }
  if uid <= 0 {
    raise Invalid(401, "Authentication required")
  }
  let uid = @identity.UserId::from_int(uid)
  let me = self.one(
    "SELECT " + user_columns + " FROM users WHERE id=? AND is_deleted=0",
    [uid.to_sql()],
  )
  let params = [uid.to_sql()]
  match (verb, path) {
    ("GET", "/user/info") => return self.profile(me).to_json()
    ("PUT", "/user/update") => {
      let username = string(body, "username")
      let email = string(body, "email")
      if username.length() > 255 || email.length() > 255 {
        raise Invalid(400, "Value too long")
      }
      self.query(
        "UPDATE users SET username=COALESCE(NULLIF(?,''),username), email=COALESCE(NULLIF(?,''),email), updated_at=? WHERE id=?",
        [
          username.to_sql(),
          email.to_sql(),
          (self.host.now)().to_sql(),
          uid.to_sql(),
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
      self.query("UPDATE users SET avatar_url=?,updated_at=? WHERE id=?", [
        avatar.to_sql(),
        (self.host.now)().to_sql(),
        uid.to_sql(),
      ])
      |> ignore
      return { "avatar_url": (self.host.public_url)(avatar).to_json() }
    }
    ("GET", "/memo") => {
      let result = self.rows(
        "SELECT memo1,memo2 FROM memos WHERE user_id=?", params,
      )
      if result.is_empty() {
        return @shared.MemoDto::{ memo1: "", memo2: "", }.to_json()
      }
      let memo : @shared.MemoDto = result[0].decode()
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
      self.query(
        "INSERT INTO memos (user_id,memo1,memo2) VALUES (?,?,?) ON DUPLICATE KEY UPDATE memo1=VALUES(memo1),memo2=VALUES(memo2)",
        [uid.to_sql(), memo.memo1.to_sql(), memo.memo2.to_sql()],
      )
      |> ignore
      return memo.to_json()
    }
    ("GET", "/users/search") => {
      if search == "" {
        raise Invalid(400, "Search query is required")
      }
      let result = self.rows(
        "SELECT " +
        user_columns +
        " FROM users WHERE is_deleted=0 AND LOCATE(?,username)>0 ORDER BY id LIMIT 10",
        [search.to_sql()],
      )
      return result.map(fn(v) raise { self.user(v).to_json() }).to_json()
    }
    ("GET", "/friend/me") =>
      return { "friends": self.social(uid).friends.to_json() }
    ("GET", "/friends") => return self.social(uid).to_json()
    ("POST", "/friend/register") =>
      return self
        .friendship(
          uid,
          @identity.UserId::from_int(number(body, "target_user_id")),
          "request",
        )
        .to_json()
    ("GET", "/notifications") => return self.inbox(uid).to_json()
    ("PUT", "/notifications/read") => {
      let through = number(body, "through_id")
      self.query(
        "UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP(3)) WHERE user_id=? AND id<=?",
        [uid.to_sql(), through.to_sql()],
      )
      |> ignore
      self.notify_user(uid)
      return self.inbox(uid).to_json()
    }
    ("GET", "/stats") => return self.stats(uid).to_json()
    ("GET", "/events/overview") => return self.event_overviews(uid).to_json()
    ("GET", "/events") =>
      return self
        .rows(event_sql + " ORDER BY e.event_start DESC,e.id DESC", [])
        .map(fn(v) raise { event(v).to_json() })
        .to_json()
    ("POST", "/events") => {
      if me.text("role") == "USER" {
        raise Invalid(403, "Administrator required")
      }
      let start = string(body, "event_start")
      let times = (self.host.event_times)(
        if start == "" {
          string(body, "dateTime")
        } else {
          start
        },
      )
      guard times is Some(t) else {
        raise Invalid(400, "Invalid date time format")
      }
      let theme = required(body, "theme", 1000)
      let topics : Array[String] = @json.from_json(field(body, "topics")) catch {
        _ => raise Invalid(400, "Invalid topics")
      }
      if topics.length() > 3 || topics.any(fn(s) { s.length() > 1000 }) {
        raise Invalid(400, "Invalid topics")
      }
      let statements : Array[Statement] = [
        {
          sql: "INSERT INTO ai_themes (theme_text,topic1,topic2,topic3) VALUES (?,?,?,?)",
          params: [
            theme.to_sql(),
            topics.get(0).unwrap_or("").to_sql(),
            topics.get(1).unwrap_or("").to_sql(),
            topics.get(2).unwrap_or("").to_sql(),
          ],
        },
        {
          sql: "INSERT INTO events (event_start,event_end,theme_id) VALUES (?,?,LAST_INSERT_ID())",
          params: [t.start.to_sql(), t.end.to_sql()],
        },
        { sql: event_sql + " WHERE e.id=LAST_INSERT_ID()", params: [], },
      ]
      let result = self.transaction(statements)
      match result {
        Rows([row, ..]) => return event(row).to_json()
        _ => raise HostError::InvalidData
      }
    }
    ("POST", "/chat/ask") | ("POST", "/chat/theme") => {
      let content = required(body, "content", 4000)
      return (self.host.chat)(
        if path == "/chat/theme" {
          Theme
        } else {
          Ask
        },
        content,
      ).to_json()
    }
    ("GET", "/rooms") =>
      return self
        .rows(
          "SELECT c.id,a.user_id AS user_a,b.user_id AS user_b,c.event_id,c.round_no AS round FROM conversations c JOIN conversation_members a ON a.conversation_id=c.id AND a.seat=0 JOIN conversation_members b ON b.conversation_id=c.id AND b.seat=1 WHERE (a.user_id=? OR b.user_id=?) AND c.ended_at=0 AND c.cancelled_at=0 ORDER BY c.id",
          [uid.to_sql(), uid.to_sql()],
        )
        .to_json()
    ("GET", "/conversations") =>
      return self.list_conversations(uid, false).to_json()
    ("GET", "/conversations/history/page") =>
      return self.history_page(uid, None).to_json()
    ("GET", "/conversations/history") =>
      return self.list_conversations(uid, true).to_json()
    ("POST", "/conversations/direct") =>
      return self.create_direct(uid, body).to_json()
    ("GET", "/topics") =>
      return self
        .rows(
          "SELECT theme_text AS theme,topic1,topic2,topic3 FROM ai_themes ORDER BY id DESC",
          [],
        )
        .map(fn(v) raise {
          (
            {
              "theme": v.field("theme").to_json(),
              "topics": [
                v.field("topic1").to_json(),
                v.field("topic2").to_json(),
                v.field("topic3").to_json(),
              ],
            } : Json)
        })
        .to_json()
    ("GET", "/sessions") =>
      return self
        .rows(
          "SELECT e.event_start AS date_time,t.theme_text AS theme FROM event_records r JOIN events e ON e.id=r.event_id JOIN ai_themes t ON t.id=e.theme_id WHERE r.user_id=? ORDER BY e.event_start DESC",
          params,
        )
        .map(fn(v) raise {
          (
            {
              "theme": v.field("theme").to_json(),
              "date_time": v.field("date_time").to_json(),
              "sessions": [1, 2, 3],
            } : Json)
        })
        .to_json()
    ("GET", "/session_history") =>
      return self
        .rows(
          "SELECT u.avatar_url AS avatar,u.username AS user,t.theme_text AS theme,e.event_start AS date,u.rank,'unapplied' AS friend_state FROM conversation_members mine JOIN conversations c ON c.id=mine.conversation_id JOIN conversation_members partner ON partner.conversation_id=c.id AND partner.user_id<>mine.user_id JOIN users u ON u.id=partner.user_id JOIN events e ON e.id=c.event_id JOIN ai_themes t ON t.id=e.theme_id WHERE mine.user_id=? AND c.ended_at>0 ORDER BY c.ended_at DESC,c.id DESC",
          [uid.to_sql()],
        )
        .to_json()
    _ => ()
  }
  let segments = path.split("/").map(fn(s) { s.to_owned() }).collect()
  match (verb, segments) {
    ("GET", ["", "conversations", "history", "page", cursor]) => {
      let cursor = @shared.parse_history_cursor(cursor) catch {
        _ => raise Invalid(400, "Invalid history cursor")
      }
      return self.history_page(uid, Some(cursor)).to_json()
    }
    ("POST", ["", "friends", id, action]) =>
      return self.friendship(uid, path_user(id), action).to_json()
    ("GET", ["", "messages", id]) =>
      return self.thread(uid, path_user(id), 0).to_json()
    ("GET", ["", "messages", id, "before", cursor]) =>
      return self.thread(uid, path_user(id), path_id(cursor)).to_json()
    ("POST", ["", "messages", id]) =>
      return self.send_message(uid, path_user(id), body).to_json()
    ("PUT", ["", "messages", id, "read"]) => {
      let target = path_user(id)
      self.require_friend(uid, target) |> ignore
      let through = number(body, "through_id")
      self.query(
        "UPDATE direct_messages SET read_at=COALESCE(read_at,UTC_TIMESTAMP(3)) WHERE recipient_id=? AND sender_id=? AND id<=?",
        [uid.to_sql(), target.to_sql(), through.to_sql()],
      )
      |> ignore
      self.query(
        "UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP(3)) WHERE user_id=? AND actor_id=? AND kind='message' AND message_id<=?",
        [uid.to_sql(), target.to_sql(), through.to_sql()],
      )
      |> ignore
      self.notify_user(uid)
      self.notify_user(target)
      return self.thread(uid, target, 0).to_json()
    }
    ("GET", ["", "conversations", id, "learning"]) =>
      return self.learning(path_conversation(id), uid).to_json()
    ("PUT", ["", "conversations", id, "survey"]) =>
      return self.save_survey(path_conversation(id), uid, body).to_json()
    ("POST", ["", "conversations", id, "feedback"]) =>
      return self.generate_feedback(path_conversation(id), uid).to_json()
    ("GET", ["", "events", id, "roster"]) => {
      if me.text("role") == "USER" {
        raise Invalid(403, "Administrator required")
      }
      return self.event_roster(path_id(id)).to_json()
    }
    ("GET", ["", "conversations", id]) =>
      return self
        .conversation_dto(self.conversation_row(path_conversation(id), uid))
        .to_json()
    ("POST", ["", "conversations", id, "start"]) =>
      return self
        .change_conversation(path_conversation(id), uid, Start)
        .to_json()
    ("POST", ["", "conversations", id, "finish"]) =>
      return self
        .change_conversation(path_conversation(id), uid, Finish)
        .to_json()
    ("POST", ["", "conversations", id, "cancel"]) =>
      return self
        .change_conversation(path_conversation(id), uid, Cancel)
        .to_json()
    ("GET", ["", "conversations", id, "reflection"]) => {
      let id = path_conversation(id)
      self.conversation_row(id, uid) |> ignore
      return self.get_reflection(id, uid).to_json()
    }
    ("PUT", ["", "conversations", id, "reflection"]) =>
      return self.save_reflection(path_conversation(id), uid, body).to_json()
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
      self.one("SELECT id FROM events WHERE id=?", [id.to_sql()]) |> ignore
      // Lock the event row in the same transaction used by the matching writer.
      let statements : Array[Statement] = [
        {
          sql: "SELECT id FROM events WHERE id=? FOR UPDATE",
          params: [id.to_sql()],
        },
        {
          sql: "INSERT INTO event_records(event_id,user_id,participates_bit) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM event_match_runs WHERE event_id=?) ON DUPLICATE KEY UPDATE participates_bit=IF(EXISTS(SELECT 1 FROM event_match_runs WHERE event_id=?),participates_bit,VALUES(participates_bit))",
          params: [
            id.to_sql(),
            uid.to_sql(),
            bit.to_sql(),
            id.to_sql(),
            id.to_sql(),
          ],
        },
        {
          sql: "SELECT participates_bit FROM event_records WHERE event_id=? AND user_id=?",
          params: [id.to_sql(), uid.to_sql()],
        },
      ]
      let saved = self.transaction(statements)
      match saved {
        Rows([row]) =>
          if row.int("participates_bit") == bit {
            return { "message": "Participation saved" }
          } else {
            raise Invalid(409, "Matching already started")
          }
        _ => raise Invalid(409, "Matching already started")
      }
    }
    ("POST", ["", "events", event_id, "match"]) => {
      if me.text("role") == "USER" {
        raise Invalid(403, "Administrator required")
      }
      let id = path_id(event_id)
      self.one("SELECT id FROM events WHERE id=?", [id.to_sql()]) |> ignore
      // A transaction reserves this event and snapshots its roster. Later
      // registrations cannot change it. Failed publication can be retried.
      let snapshot = self.transaction([
        {
          sql: "SELECT id FROM events WHERE id=? FOR UPDATE",
          params: [id.to_sql()],
        },
        {
          sql: "INSERT IGNORE INTO event_match_runs(event_id) VALUES (?)",
          params: [id.to_sql()],
        },
        {
          sql: "SELECT r.user_id,u.rank,r.participates_bit FROM event_records r JOIN users u ON u.id=r.user_id WHERE r.event_id=? AND u.is_deleted=0 ORDER BY u.rank,r.id",
          params: [id.to_sql()],
        },
      ])
      let roster : Array[@matching.Participant] = snapshot
        .rows()
        .map(fn(row) raise { row.decode() })
      let statements : Array[Statement] = [
        {
          sql: "SELECT id FROM events WHERE id=? FOR UPDATE",
          params: [id.to_sql()],
        },
        {
          sql: "INSERT INTO event_match_publications(event_id) VALUES (?)",
          params: [id.to_sql()],
        },
      ]
      for round in 1..<=3 {
        for pair in @matching.pair_round(roster, round, 0) {
          statements.push({
            sql: "INSERT INTO conversations(event_id,round_no) VALUES (?,?)",
            params: [id.to_sql(), round.to_sql()],
          })
          let first = if pair.first < pair.second {
            pair.first
          } else {
            pair.second
          }
          let second = if pair.first < pair.second {
            pair.second
          } else {
            pair.first
          }
          statements.push({
            sql: "INSERT INTO conversation_members(conversation_id,event_id,round_no,user_id,seat) VALUES (LAST_INSERT_ID(),?,?,?,0),(LAST_INSERT_ID(),?,?,?,1)",
            params: [
              id.to_sql(),
              round.to_sql(),
              first.to_sql(),
              id.to_sql(),
              round.to_sql(),
              second.to_sql(),
            ],
          })
        }
      }
      statements.push({
        sql: "INSERT INTO notifications(user_id,actor_id,event_key,kind,conversation_id) SELECT m.user_id,p.user_id,CONCAT('event-call:',m.conversation_id),'event_matched',m.conversation_id FROM conversation_members m JOIN conversation_members p ON p.conversation_id=m.conversation_id AND p.user_id<>m.user_id WHERE m.event_id=?",
        params: [id.to_sql()],
      })
      statements.push({
        sql: "SELECT c.id,a.user_id AS user_a,b.user_id AS user_b,c.event_id,c.round_no AS round FROM conversations c JOIN conversation_members a ON a.conversation_id=c.id AND a.seat=0 JOIN conversation_members b ON b.conversation_id=c.id AND b.seat=1 WHERE c.event_id=? ORDER BY c.round_no,c.id",
        params: [id.to_sql()],
      })
      let result = self.transaction(statements)
      for person in roster {
        self.notify_user(@identity.UserId::from_int(person.user_id))
      }
      return result.rows().to_json()
    }
    ("GET", ["", "users", "search", "id", id]) =>
      return self
        .user(
          self.one(
            "SELECT " + user_columns + " FROM users WHERE id=? AND is_deleted=0",
            [path_id(id).to_sql()],
          ),
        )
        .to_json()
    ("GET", ["", "users", id, "avatar"]) => {
      let u = self.one(
        "SELECT avatar_url FROM users WHERE id=? AND is_deleted=0",
        [path_id(id).to_sql()],
      )
      let avatar = u.text("avatar_url")
      if avatar == "" {
        raise Invalid(404, "User has no avatar")
      }
      return { "avatar_url": (self.host.public_url)(avatar).to_json() }
    }
    ("GET", ["", "friend", name]) => {
      let f : @shared.FriendSummaryDto = self
        .one(
          "SELECT u.id,u.username,u.avatar_url FROM friendships f JOIN users u ON u.id=IF(f.low_user_id=?,f.high_user_id,f.low_user_id) WHERE (f.low_user_id=? OR f.high_user_id=?) AND u.username=? AND f.status='FRIEND'",
          [uid.to_sql(), uid.to_sql(), uid.to_sql(), name.to_sql()],
        )
        .decode()
      return { ..f, avatar_url: (self.host.public_url)(f.avatar_url), }.to_json()
    }
    _ => raise Invalid(404, "Not found")
  }
}
