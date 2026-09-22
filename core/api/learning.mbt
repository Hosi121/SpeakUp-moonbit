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
async fn stats(uid : Int) -> @shared.StatsDto {
  let row = one(
    "SELECT COUNT(*) AS total_calls,CAST(COALESCE(SUM(c.event_id IS NOT NULL),0) AS SIGNED) AS event_calls,COUNT(DISTINCT p.user_id) AS partners,CAST(COALESCE(FLOOR(SUM((c.ended_at-c.started_at)/60000)),0) AS SIGNED) AS minutes,COUNT(r.conversation_id) AS reflections FROM conversation_members m JOIN conversations c ON c.id=m.conversation_id JOIN conversation_members p ON p.conversation_id=c.id AND p.user_id<>m.user_id LEFT JOIN conversation_reflections r ON r.conversation_id=c.id AND r.user_id=m.user_id WHERE m.user_id=? AND c.ended_at>0",
    [uid.to_json()],
  )
  let total : Int = @json.from_json(field(row, "total_calls"))
  let events : Int = @json.from_json(field(row, "event_calls"))
  let partners : Int = @json.from_json(field(row, "partners"))
  let minutes : Int = @json.from_json(field(row, "minutes"))
  let reflections : Int = @json.from_json(field(row, "reflections"))
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
async fn learning(id : Int, uid : Int) -> @shared.LearningDto {
  conversation_row(id, uid) |> ignore
  let survey = rows(
    "SELECT answers FROM conversation_surveys WHERE conversation_id=? AND user_id=?",
    [id.to_json(), uid.to_json()],
  )
  let answers : Array[Int] = if survey.is_empty() {
    []
  } else {
    @json.from_json(@json.parse(string(survey[0], "answers")))
  }
  let feedback = rows(
    "SELECT f.feedback,f.updated_at,(BINARY f.source_comment=BINARY r.comment AND BINARY f.source_learned=BINARY r.learned_expressions) AS current FROM reflection_feedback f JOIN conversation_reflections r ON r.conversation_id=f.conversation_id AND r.user_id=f.user_id WHERE f.conversation_id=? AND f.user_id=?",
    [id.to_json(), uid.to_json()],
  )
  {
    answers,
    feedback: if feedback.is_empty() {
      ""
    } else {
      string(feedback[0], "feedback")
    },
    feedback_current: !feedback.is_empty() &&
    field(feedback[0], "current") == (1).to_json(),
    updated_at: if feedback.is_empty() {
      ""
    } else {
      iso(string(feedback[0], "updated_at"))
    },
  }
}

///|
async fn save_survey(id : Int, uid : Int, body : Json) -> @shared.LearningDto {
  let dto = conversation_dto(conversation_row(id, uid))
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
  query(
    "INSERT INTO conversation_surveys(conversation_id,user_id,answers) VALUES (?,?,?) ON DUPLICATE KEY UPDATE answers=VALUES(answers),updated_at=UTC_TIMESTAMP(3)",
    [id.to_json(), uid.to_json(), values.to_json().stringify().to_json()],
  )
  |> ignore
  learning(id, uid)
}

///|
async fn generate_feedback(id : Int, uid : Int) -> @shared.LearningDto {
  let dto = conversation_dto(conversation_row(id, uid))
  if dto.ended_at == 0 {
    raise Invalid(409, "Finish the conversation first")
  }
  let reflection = get_reflection(id, uid)
  if !reflection.saved ||
    (
      reflection.comment.trim().is_empty() &&
      reflection.learned_expressions.trim().is_empty()
    ) {
    raise Invalid(400, "Save your written reflection first")
  }
  let existing = learning(id, uid)
  if existing.feedback_current {
    return existing
  }
  let result = invoke({
    "operation": "chat",
    "kind": "/chat/feedback",
    "content": ("感想:\n" +
    reflection.comment +
    "\n学んだ表現:\n" +
    reflection.learned_expressions).to_json(),
  })
  guard result
    is {
      "choices": Array(
        [{ "message": { "content": String(feedback), .. }, .. }, ..]
      ),
      ..
    } else {
    raise Upstream("Invalid AI response")
  }
  if feedback.trim().is_empty() || feedback.length() > 16000 {
    raise Upstream("Invalid AI response")
  }
  // Do not overwrite feedback with an answer based on a concurrently edited reflection.
  query(
    "INSERT INTO reflection_feedback(conversation_id,user_id,source_comment,source_learned,feedback) SELECT conversation_id,user_id,comment,learned_expressions,? FROM conversation_reflections WHERE conversation_id=? AND user_id=? AND BINARY comment=BINARY ? AND BINARY learned_expressions=BINARY ? ON DUPLICATE KEY UPDATE source_comment=VALUES(source_comment),source_learned=VALUES(source_learned),feedback=VALUES(feedback),updated_at=UTC_TIMESTAMP(3)",
    [
      feedback.to_json(),
      id.to_json(),
      uid.to_json(),
      reflection.comment.to_json(),
      reflection.learned_expressions.to_json(),
    ],
  )
  |> ignore
  let current = get_reflection(id, uid)
  if current.comment != reflection.comment ||
    current.learned_expressions != reflection.learned_expressions {
    raise Invalid(409, "Reflection changed; generate feedback again")
  }
  learning(id, uid)
}
