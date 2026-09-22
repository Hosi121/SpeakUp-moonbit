///|
/// Membership lives once, in conversation_members. The two joins are indexed.
let conversation_sql : String = "SELECT c.id,COALESCE(c.event_id,0) AS event_id,COALESCE(c.round_no,0) AS round,c.started_at,c.ended_at,c.cancelled_at,c.revision,a.user_id AS first,b.user_id AS second,COALESCE(e.event_start,'') AS event_start,COALESCE(t.theme_text,'1 対 1 通話') AS theme_text,COALESCE(t.topic1,'') AS topic1,COALESCE(t.topic2,'') AS topic2,COALESCE(t.topic3,'') AS topic3,ua.username AS first_username,ua.avatar_url AS first_avatar,ub.username AS second_username,ub.avatar_url AS second_avatar FROM conversation_members mine JOIN conversations c ON c.id=mine.conversation_id JOIN conversation_members a ON a.conversation_id=c.id AND a.seat=0 JOIN conversation_members b ON b.conversation_id=c.id AND b.seat=1 LEFT JOIN events e ON e.id=c.event_id LEFT JOIN ai_themes t ON t.id=e.theme_id JOIN users ua ON ua.id=a.user_id JOIN users ub ON ub.id=b.user_id WHERE mine.user_id=?"

///|
fn conversation_dto(v : Json) -> @shared.ConversationDto raise {
  let s : @conversation.Snapshot = @json.from_json(v)
  @conversation.state(s) |> ignore
  {
    id: s.id,
    event_id: @json.from_json(field(v, "event_id")),
    round: @json.from_json(field(v, "round")),
    started_at: s.started_at,
    ended_at: s.ended_at,
    cancelled_at: s.cancelled_at,
    revision: s.revision,
    theme: string(v, "theme_text"),
    topics: [string(v, "topic1"), string(v, "topic2"), string(v, "topic3")].filter(fn(
        t,
      ) {
        t != ""
      },
    ),
    participants: [
      {
        id: s.first,
        username: string(v, "first_username"),
        avatar_url: @platform.publicUrl(string(v, "first_avatar")),
      },
      {
        id: s.second,
        username: string(v, "second_username"),
        avatar_url: @platform.publicUrl(string(v, "second_avatar")),
      },
    ],
    event_start: iso(string(v, "event_start")),
  }
}

///|
async fn conversation_row(id : Int, uid : Int) -> Json {
  one(conversation_sql + " AND c.id=?", [uid.to_json(), id.to_json()])
}

///|
async fn list_conversations(
  uid : Int,
  completed : Bool,
) -> Array[@shared.ConversationDto] {
  let suffix = if completed {
    " AND c.ended_at>0 ORDER BY c.ended_at DESC,c.id DESC LIMIT 100"
  } else {
    " AND c.ended_at=0 AND c.cancelled_at=0 ORDER BY c.id DESC LIMIT 100"
  }
  rows(conversation_sql + suffix, [uid.to_json()]).map(conversation_dto)
}

///|
async fn change_conversation(
  id : Int,
  uid : Int,
  action : String,
) -> @shared.ConversationDto {
  // Optimistic concurrency: only an actual transition writes. Retries return
  // the original timestamps; simultaneous finish requests converge.
  for attempt in 0..<4 {
    let row = conversation_row(id, uid)
    let before : @conversation.Snapshot = @json.from_json(row)
    let after = if action == "start" {
      @conversation.begin(before, uid, @platform.nowMillis())
    } else if action == "cancel" {
      @conversation.cancel(before, uid, @platform.nowMillis())
    } else {
      @conversation.finish(before, uid, @platform.nowMillis())
    }
    let dto = conversation_dto(row)
    if after.revision == before.revision {
      return dto
    }
    let result = query(
      "UPDATE conversations SET started_at=?,ended_at=?,cancelled_at=?,revision=? WHERE id=? AND revision=?",
      [
        after.started_at.to_json(),
        after.ended_at.to_json(),
        after.cancelled_at.to_json(),
        after.revision.to_json(),
        id.to_json(),
        before.revision.to_json(),
      ],
    )
    if field(result, "affectedRows") == (1).to_json() {
      return {
        ..dto,
        started_at: after.started_at,
        ended_at: after.ended_at,
        cancelled_at: after.cancelled_at,
        revision: after.revision,
      }
    }
    ignore(attempt)
  }
  raise Invalid(409, "Conversation changed; retry")
}

///|
async fn create_direct(uid : Int, body : Json) -> @shared.ConversationDto {
  let target = number(body, "target_user_id")
  if target == uid {
    raise Invalid(400, "Choose another participant")
  }
  one("SELECT id FROM users WHERE id=? AND is_deleted=0", [target.to_json()])
  |> ignore
  let request_id = required(body, "request_id", 64)
  if request_id.length() < 16 ||
    !request_id
    .iter()
    .all(fn(c) {
      (c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') ||
      c == '-'
    }) {
    raise Invalid(400, "Invalid request ID")
  }
  let existing = rows(
    "SELECT conversation_id FROM conversation_requests WHERE user_id=? AND request_id=?",
    [uid.to_json(), request_id.to_json()],
  )
  if existing.is_empty() {
    let first = if uid < target { uid } else { target }
    let second = if uid < target { target } else { uid }
    // Unique request key makes retries atomic, including concurrent requests.
    let _ = invoke({
      "operation": "transaction",
      "statements": [
        { "sql": "INSERT INTO conversations() VALUES()", "params": [] },
        {
          "sql": "INSERT INTO conversation_members(conversation_id,user_id,seat) VALUES(LAST_INSERT_ID(),?,0),(LAST_INSERT_ID(),?,1)",
          "params": [first.to_json(), second.to_json()],
        },
        {
          "sql": "INSERT INTO conversation_requests(user_id,request_id,conversation_id) VALUES(?,?,LAST_INSERT_ID())",
          "params": [uid.to_json(), request_id.to_json()],
        },
      ],
    }) catch {
      Upstream("conflict") => Json::null()
      e => raise e
    }
  }
  let saved = one(
    "SELECT conversation_id FROM conversation_requests WHERE user_id=? AND request_id=?",
    [uid.to_json(), request_id.to_json()],
  )
  let dto = conversation_dto(
    conversation_row(number(saved, "conversation_id"), uid),
  )
  if !dto.participants.any(fn(p) { p.id == target }) {
    raise Invalid(409, "Request ID belongs to a different conversation")
  }
  dto
}

///|
async fn get_reflection(id : Int, uid : Int) -> @shared.ReflectionDto {
  let xs = rows(
    "SELECT satisfaction,comment,learned_expressions,updated_at FROM conversation_reflections WHERE conversation_id=? AND user_id=?",
    [id.to_json(), uid.to_json()],
  )
  if xs.is_empty() {
    return {
      saved: false,
      satisfaction: 50,
      comment: "",
      learned_expressions: "",
      updated_at: "",
    }
  }
  let v : @shared.ReflectionDto = @json.from_json({
    "saved": true,
    "satisfaction": field(xs[0], "satisfaction"),
    "comment": field(xs[0], "comment"),
    "learned_expressions": field(xs[0], "learned_expressions"),
    "updated_at": field(xs[0], "updated_at"),
  })
  { ..v, updated_at: iso(v.updated_at), }
}

///|
async fn save_reflection(
  id : Int,
  uid : Int,
  body : Json,
) -> @shared.ReflectionDto {
  let row = conversation_row(id, uid)
  let s : @conversation.Snapshot = @json.from_json(row)
  if @conversation.state(s) != "completed" {
    raise Invalid(409, "Finish the conversation first")
  }
  let satisfaction = match field(body, "satisfaction") {
    Number(n, ..) if n >= 0 && n <= 100 && n == n.to_int().to_double() =>
      n.to_int()
    _ => raise Invalid(400, "Satisfaction must be an integer from 0 to 100")
  }
  let comment = string(body, "comment")
  let learned = string(body, "learned_expressions")
  if comment.length() > 4000 || learned.length() > 8000 {
    raise Invalid(400, "Reflection too long")
  }
  query(
    "INSERT INTO conversation_reflections(conversation_id,user_id,satisfaction,comment,learned_expressions) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE satisfaction=VALUES(satisfaction),comment=VALUES(comment),learned_expressions=VALUES(learned_expressions),updated_at=UTC_TIMESTAMP()",
    [
      id.to_json(),
      uid.to_json(),
      satisfaction.to_json(),
      comment.to_json(),
      learned.to_json(),
    ],
  )
  |> ignore
  get_reflection(id, uid)
}
