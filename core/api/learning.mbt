///|
fn achievement(
  code : String,
  title : String,
  progress : Int,
  target : Int,
) -> @shared.AchievementDto {
  { code, title, progress, target, earned: progress >= target, }
}

///|
async fn Api::stats(self : Self, uid : @identity.UserId) -> @shared.StatsDto {
  let row = self.one(
    "SELECT COUNT(*) AS total_calls,CAST(COALESCE(SUM(c.event_id IS NOT NULL),0) AS SIGNED) AS event_calls,COUNT(DISTINCT p.user_id) AS partners,CAST(COALESCE(FLOOR(SUM((c.ended_at-c.started_at)/60000)),0) AS SIGNED) AS minutes,COUNT(r.conversation_id) AS reflections FROM conversation_members m JOIN conversations c ON c.id=m.conversation_id JOIN conversation_members p ON p.conversation_id=c.id AND p.user_id<>m.user_id LEFT JOIN conversation_reflections r ON r.conversation_id=c.id AND r.user_id=m.user_id WHERE m.user_id=? AND c.ended_at>0",
    [uid.to_sql()],
  )
  let total : Int = row.int("total_calls")
  let events : Int = row.int("event_calls")
  let partners : Int = row.int("partners")
  let minutes : Int = row.int("minutes")
  let reflections : Int = row.int("reflections")
  {
    total_calls: total,
    event_calls: events,
    direct_calls: total - events,
    partners,
    minutes,
    reflections,
    achievements: [
      achievement("first_call", "はじめての会話", total, 1),
      achievement("ten_calls", "10 回の会話", total, 10),
      achievement("five_partners", "5 人と会話", partners, 5),
      achievement(
        "first_reflection", "はじめての振り返り", reflections, 1,
      ),
      achievement("ten_reflections", "振り返りを 10 回", reflections, 10),
    ],
  }
}

///|
async fn Api::learning(
  self : Self,
  id : @identity.ConversationId,
  uid : @identity.UserId,
) -> @shared.LearningDto {
  self.conversation_row(id, uid) |> ignore
  let survey = self.rows(
    "SELECT answers FROM conversation_surveys WHERE conversation_id=? AND user_id=?",
    [id.to_sql(), uid.to_sql()],
  )
  let answers : Array[Int] = if survey.is_empty() {
    []
  } else {
    @json.from_json(@json.parse(survey[0].text("answers")))
  }
  let feedback = self.rows(
    "SELECT f.feedback,f.updated_at,(BINARY f.source_comment=BINARY r.comment AND BINARY f.source_learned=BINARY r.learned_expressions) AS current FROM reflection_feedback f JOIN conversation_reflections r ON r.conversation_id=f.conversation_id AND r.user_id=f.user_id WHERE f.conversation_id=? AND f.user_id=?",
    [id.to_sql(), uid.to_sql()],
  )
  {
    answers,
    feedback: if feedback.is_empty() {
      ""
    } else {
      feedback[0].text("feedback")
    },
    feedback_current: !feedback.is_empty() && feedback[0].int("current") == 1,
    updated_at: if feedback.is_empty() {
      ""
    } else {
      iso(feedback[0].text("updated_at"))
    },
  }
}

///|
async fn Api::save_survey(
  self : Self,
  id : @identity.ConversationId,
  uid : @identity.UserId,
  body : Json,
) -> @shared.LearningDto {
  let dto = self.conversation_dto(self.conversation_row(id, uid))
  if dto.ended_at == 0 {
    raise Invalid(409, "Finish the conversation first")
  }
  guard field(body, "answers") is Array(values) else {
    raise Invalid(400, "Expected six answers")
  }
  if values.length() != 6 {
    raise Invalid(400, "Expected six answers")
  }
  for value in values {
    guard value is Number(n, ..) && n >= 0 && n <= 2 && n.trunc() == n else {
      raise Invalid(400, "Invalid answer")
    }
  }
  self.query(
    "INSERT INTO conversation_surveys(conversation_id,user_id,answers) VALUES (?,?,?) ON DUPLICATE KEY UPDATE answers=VALUES(answers),updated_at=UTC_TIMESTAMP(3)",
    [id.to_sql(), uid.to_sql(), values.to_json().stringify().to_sql()],
  )
  |> ignore
  self.learning(id, uid)
}

///|
async fn Api::generate_feedback(
  self : Self,
  id : @identity.ConversationId,
  uid : @identity.UserId,
) -> @shared.LearningDto {
  let dto = self.conversation_dto(self.conversation_row(id, uid))
  if dto.ended_at == 0 {
    raise Invalid(409, "Finish the conversation first")
  }
  let reflection = self.get_reflection(id, uid)
  if !reflection.saved ||
    (
      reflection.comment.trim().is_empty() &&
      reflection.learned_expressions.trim().is_empty()
    ) {
    raise Invalid(400, "Save your written reflection first")
  }
  let existing = self.learning(id, uid)
  if existing.feedback_current {
    return existing
  }
  let result = (self.host.chat)(
    Feedback,
    "感想:\n" +
    reflection.comment +
    "\n学んだ表現:\n" +
    reflection.learned_expressions,
  )
  let feedback = result.content
  if feedback.trim().is_empty() || feedback.length() > 16000 {
    raise HostError::InvalidData
  }
  // Do not overwrite feedback with an answer based on a concurrently edited reflection.
  self.query(
    "INSERT INTO reflection_feedback(conversation_id,user_id,source_comment,source_learned,feedback) SELECT conversation_id,user_id,comment,learned_expressions,? FROM conversation_reflections WHERE conversation_id=? AND user_id=? AND BINARY comment=BINARY ? AND BINARY learned_expressions=BINARY ? ON DUPLICATE KEY UPDATE source_comment=VALUES(source_comment),source_learned=VALUES(source_learned),feedback=VALUES(feedback),updated_at=UTC_TIMESTAMP(3)",
    [
      feedback.to_sql(),
      id.to_sql(),
      uid.to_sql(),
      reflection.comment.to_sql(),
      reflection.learned_expressions.to_sql(),
    ],
  )
  |> ignore
  let current = self.get_reflection(id, uid)
  if current.comment != reflection.comment ||
    current.learned_expressions != reflection.learned_expressions {
    raise Invalid(409, "Reflection changed; generate feedback again")
  }
  self.learning(id, uid)
}
