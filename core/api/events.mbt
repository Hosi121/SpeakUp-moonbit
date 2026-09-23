///|
async fn event_overviews(uid : Int) -> Array[@shared.EventOverviewDto] {
  rows(
    "SELECT e.id,e.event_start,e.event_end,e.theme_id,t.theme_text,t.topic1,t.topic2,t.topic3,COALESCE(r.participates_bit,0) AS participates_bit,(SELECT COUNT(*) FROM event_records x JOIN users u ON u.id=x.user_id WHERE x.event_id=e.id AND x.participates_bit>0 AND u.is_deleted=0) AS registered_count,CASE WHEN p.event_id IS NOT NULL THEN 'published' WHEN m.event_id IS NOT NULL THEN 'matching' ELSE 'open' END AS matching_state FROM events e JOIN ai_themes t ON t.id=e.theme_id LEFT JOIN event_records r ON r.event_id=e.id AND r.user_id=? LEFT JOIN event_match_runs m ON m.event_id=e.id LEFT JOIN event_match_publications p ON p.event_id=e.id ORDER BY e.event_start DESC,e.id DESC LIMIT 100",
    [uid.to_json()],
  ).map(fn(row) raise {
    @shared.EventOverviewDto::{
      event: event(row),
      participates_bit: @json.from_json(field(row, "participates_bit")),
      registered_count: @json.from_json(field(row, "registered_count")),
      matching_state: string(row, "matching_state"),
    }
  })
}

///|
async fn event_roster(id : Int) -> @shared.EventRosterDto {
  one("SELECT id FROM events WHERE id=?", [id.to_json()]) |> ignore
  {
    members: rows(
      "SELECT u.id,u.username,u.avatar_url,r.participates_bit,CAST(COALESCE((SELECT BIT_OR(1 << (m.round_no-1)) FROM conversation_members m WHERE m.event_id=r.event_id AND m.user_id=r.user_id),0) AS SIGNED) AS matched_bit FROM event_records r JOIN users u ON u.id=r.user_id WHERE r.event_id=? AND u.is_deleted=0 ORDER BY u.id",
      [id.to_json()],
    ).map(fn(row) raise {
      @shared.EventMemberDto::{
        user: friend_dto(row),
        participates_bit: @json.from_json(field(row, "participates_bit")),
        matched_bit: @json.from_json(field(row, "matched_bit")),
      }
    }),
  }
}

///|
/// Persisted deadlines are recovered on every process start; no browser is needed.
pub async fn overdue_conversations() -> Array[Int] {
  rows(
    "SELECT id FROM conversations WHERE ended_at=0 AND cancelled_at=0 AND event_id IS NOT NULL AND started_at>0 AND started_at<=? ORDER BY started_at LIMIT 100",
    [((host().now_millis)() - 300000).to_json()],
  ).map(fn(v) raise { number(v, "id") })
}

///|
pub async fn expire_conversation(id : Int) -> ApiResponse {
  let owner = one(
    "SELECT user_id FROM conversation_members WHERE conversation_id=? AND seat=0",
    [id.to_json()],
  )
  let dto = change_conversation(id, number(owner, "user_id"), Expire)
  response(200, dto.to_json().stringify())
}
