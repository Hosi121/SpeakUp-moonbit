///|
/// Membership lives once, in conversation_members. The two joins are indexed.
let conversation_sql : String = "SELECT c.id,COALESCE(c.event_id,0) AS event_id,COALESCE(c.round_no,0) AS round,c.started_at,c.ended_at,c.cancelled_at,c.revision,a.user_id AS first,b.user_id AS second,COALESCE(e.event_start,'') AS event_start,COALESCE(t.theme_text,'1 対 1 通話') AS theme_text,COALESCE(t.topic1,'') AS topic1,COALESCE(t.topic2,'') AS topic2,COALESCE(t.topic3,'') AS topic3,ua.username AS first_username,ua.avatar_url AS first_avatar,ub.username AS second_username,ub.avatar_url AS second_avatar FROM conversation_members mine JOIN conversations c ON c.id=mine.conversation_id JOIN conversation_members a ON a.conversation_id=c.id AND a.seat=0 JOIN conversation_members b ON b.conversation_id=c.id AND b.seat=1 LEFT JOIN events e ON e.id=c.event_id LEFT JOIN ai_themes t ON t.id=e.theme_id JOIN users ua ON ua.id=a.user_id JOIN users ub ON ub.id=b.user_id WHERE mine.user_id=?"

///|
fn Api::conversation_dto(
  self : Self,
  v : DbRow,
) -> @shared.ConversationDto raise {
  self.conversation_dto_for(v, conversation_model(v))
}

///|
fn Api::conversation_dto_for(
  self : Self,
  v : DbRow,
  model : @conversation.Conversation,
) -> @shared.ConversationDto raise {
  let s = model.snapshot()
  {
    id: s.id,
    event_id: v.int("event_id"),
    round: v.int("round"),
    started_at: s.started_at,
    ended_at: s.ended_at,
    cancelled_at: s.cancelled_at,
    revision: s.revision,
    theme: v.text("theme_text"),
    topics: [v.text("topic1"), v.text("topic2"), v.text("topic3")].filter(fn(
      t,
    ) {
      t != ""
    }),
    participants: [
      {
        id: s.first,
        username: v.text("first_username"),
        avatar_url: (self.host.public_url)(v.text("first_avatar")),
      },
      {
        id: s.second,
        username: v.text("second_username"),
        avatar_url: (self.host.public_url)(v.text("second_avatar")),
      },
    ],
    event_start: iso(v.text("event_start")),
  }
}

///|
fn conversation_model(row : DbRow) -> @conversation.Conversation raise {
  @conversation.restore(
    row.decode(),
    event_id=row.int("event_id"),
    round=row.int("round"),
  )
}

///|
async fn Api::conversation_row(
  self : Self,
  id : @identity.ConversationId,
  uid : @identity.UserId,
) -> DbRow {
  self.one(conversation_sql + " AND c.id=?", [uid.to_sql(), id.to_sql()])
}

///|
async fn Api::list_conversations(
  self : Self,
  uid : @identity.UserId,
  completed : Bool,
) -> Array[@shared.ConversationDto] {
  let suffix = if completed {
    " AND c.ended_at>0 ORDER BY c.ended_at DESC,c.id DESC LIMIT 100"
  } else {
    " AND c.ended_at=0 AND c.cancelled_at=0 ORDER BY c.id DESC LIMIT 100"
  }
  self
  .rows(conversation_sql + suffix, [uid.to_sql()])
  .map(fn(row) raise { self.conversation_dto(row) })
}

///|
async fn Api::change_conversation(
  self : Self,
  id : @identity.ConversationId,
  uid : @identity.UserId,
  action : @conversation.Action,
) -> @shared.ConversationDto {
  // Optimistic concurrency: only an actual transition writes. Retries return
  // the original timestamps; simultaneous finish requests converge.
  for attempt in 0..<4 {
    let row = self.conversation_row(id, uid)
    let before = conversation_model(row)
    let changed = before.change(action, uid, (self.host.now_millis)())
    let dto = self.conversation_dto_for(row, before)
    let after = changed.snapshot()
    if after.revision == before.revision() {
      return dto
    }
    let result = self.query(
      "UPDATE conversations SET started_at=?,ended_at=?,cancelled_at=?,revision=? WHERE id=? AND revision=?",
      [
        after.started_at.to_sql(),
        after.ended_at.to_sql(),
        after.cancelled_at.to_sql(),
        after.revision.to_sql(),
        id.to_sql(),
        before.revision().to_sql(),
      ],
    )
    if result.written().affected_rows == 1 {
      for person in dto.participants {
        self.notify_user(@identity.UserId::from_int(person.id))
      }
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
async fn Api::create_direct(
  self : Self,
  uid : @identity.UserId,
  body : Json,
) -> @shared.ConversationDto {
  let target = @identity.UserId::from_int(number(body, "target_user_id"))
  if target == uid {
    raise Invalid(400, "Choose another participant")
  }
  self.one("SELECT id FROM users WHERE id=? AND is_deleted=0", [target.to_sql()])
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
  let existing = self.rows(
    "SELECT conversation_id FROM conversation_requests WHERE user_id=? AND request_id=?",
    [uid.to_sql(), request_id.to_sql()],
  )
  if existing.is_empty() {
    let first = if uid < target { uid } else { target }
    let second = if uid < target { target } else { uid }
    // Unique request key makes retries atomic, including concurrent requests.
    let _ = self.transaction([
      { sql: "INSERT INTO conversations() VALUES()", params: [], },
      {
        sql: "INSERT INTO conversation_members(conversation_id,user_id,seat) VALUES(LAST_INSERT_ID(),?,0),(LAST_INSERT_ID(),?,1)",
        params: [first.to_sql(), second.to_sql()],
      },
      {
        sql: "INSERT INTO conversation_requests(user_id,request_id,conversation_id) VALUES(?,?,LAST_INSERT_ID())",
        params: [uid.to_sql(), request_id.to_sql()],
      },
      {
        sql: "INSERT INTO notifications(user_id,actor_id,event_key,kind,conversation_id) SELECT ?,?,CONCAT('call:',conversation_id),'call_invitation',conversation_id FROM conversation_requests WHERE user_id=? AND request_id=?",
        params: [
          target.to_sql(),
          uid.to_sql(),
          uid.to_sql(),
          request_id.to_sql(),
        ],
      },
    ]) catch {
      HostError::Conflict => Written({ affected_rows: 0, insert_id: 0, })
      e => raise e
    }
  }
  let saved = self.one(
    "SELECT conversation_id FROM conversation_requests WHERE user_id=? AND request_id=?",
    [uid.to_sql(), request_id.to_sql()],
  )
  let dto = self.conversation_dto(
    self.conversation_row(saved.conversation_id("conversation_id"), uid),
  )
  if !dto.participants.any(fn(p) { p.id == target.value() }) {
    raise Invalid(409, "Request ID belongs to a different conversation")
  }
  self.notify_user(target)
  self.notify_user(uid)
  dto
}

///|
async fn Api::get_reflection(
  self : Self,
  id : @identity.ConversationId,
  uid : @identity.UserId,
) -> @shared.ReflectionDto {
  let xs = self.rows(
    "SELECT satisfaction,comment,learned_expressions,updated_at FROM conversation_reflections WHERE conversation_id=? AND user_id=?",
    [id.to_sql(), uid.to_sql()],
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
    "satisfaction": xs[0].field("satisfaction").to_json(),
    "comment": xs[0].field("comment").to_json(),
    "learned_expressions": xs[0].field("learned_expressions").to_json(),
    "updated_at": xs[0].field("updated_at").to_json(),
  })
  { ..v, updated_at: iso(v.updated_at), }
}

///|
async fn Api::save_reflection(
  self : Self,
  id : @identity.ConversationId,
  uid : @identity.UserId,
  body : Json,
) -> @shared.ReflectionDto {
  let row = self.conversation_row(id, uid)
  guard conversation_model(row).phase() is Completed(_, _) else {
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
  self.query(
    "INSERT INTO conversation_reflections(conversation_id,user_id,satisfaction,comment,learned_expressions) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE satisfaction=VALUES(satisfaction),comment=VALUES(comment),learned_expressions=VALUES(learned_expressions),updated_at=UTC_TIMESTAMP()",
    [
      id.to_sql(),
      uid.to_sql(),
      satisfaction.to_sql(),
      comment.to_sql(),
      learned.to_sql(),
    ],
  )
  |> ignore
  self.get_reflection(id, uid)
}

///|
/// Keyset pagination keeps the boundary independent of deleted rows and avoids
/// OFFSET scans. The user predicate is applied on every page.
async fn Api::history_page(
  self : Self,
  uid : @identity.UserId,
  cursor : @shared.HistoryCursor?,
) -> @shared.HistoryPage {
  let params = [uid.to_sql()]
  let boundary = match cursor {
    None => ""
    Some(cursor) => {
      params.push(cursor.ended_at.to_sql())
      params.push(cursor.ended_at.to_sql())
      params.push(cursor.id.to_sql())
      " AND (c.ended_at<? OR (c.ended_at=? AND c.id<?))"
    }
  }
  let calls = self
    .rows(
      conversation_sql +
      " AND c.ended_at>0" +
      boundary +
      " ORDER BY c.ended_at DESC,c.id DESC LIMIT 101",
      params,
    )
    .map(fn(row) raise { self.conversation_dto(row) })
  let more = calls.length() > 100
  if more {
    calls.pop() |> ignore
  }
  let next_cursor = if more {
    let last = calls[calls.length() - 1]
    @shared.HistoryCursor(
      last.ended_at,
      @identity.ConversationId::from_int(last.id),
    ).encode()
  } else {
    ""
  }
  { items: calls, next_cursor, }
}
