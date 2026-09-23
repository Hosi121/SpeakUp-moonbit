///|
fn planned() -> @conversation.Snapshot {
  {
    id: 1,
    first: 10,
    second: 20,
    started_at: 0,
    ended_at: 0,
    cancelled_at: 0,
    revision: 0,
  }
}

///|
test "durable state is independent of event origin and transport reconnects" {
  let s = planned()
  assert_eq(@conversation.state(s), "planned")
  assert_eq(@conversation.remaining(s, 1000, 300), 300)
  assert_eq(@conversation.remaining(s, 1000, 0), -1)
  let active = @conversation.begin(s, 10, 1000)
  let replay = @conversation.begin(active, 20, 9000)
  assert_eq(replay.started_at, 1000)
  assert_eq(replay.revision, 1)
  assert_eq(@conversation.partner(active, 10), 20)
  assert_eq(@conversation.remaining(active, 3000, 300), 298)
  let ended = @conversation.finish(active, 20, 4000)
  let repeated = @conversation.finish(ended, 10, 10000)
  assert_eq(repeated.ended_at, 4000)
  assert_eq(repeated.revision, 2)
  assert_eq(@conversation.remaining(ended, 10000, 0), 0)
}

///|
test "unfinished invitations may be cancelled but not recorded as conversations" {
  let s = @conversation.cancel(planned(), 20, 1000)
  assert_eq(@conversation.state(s), "cancelled")
  assert_eq(@conversation.cancel(s, 10, 9000).cancelled_at, 1000)
  let failed = try {
    @conversation.begin(s, 10, 9000) |> ignore
    false
  } catch {
    @conversation.AlreadyCompleted => true
    _ => false
  }
  assert_true(failed)
}

///|
test "transitions reject outsiders and finishing before connection" {
  let denied = try {
    @conversation.begin(planned(), 30, 1000) |> ignore
    false
  } catch {
    @conversation.NotParticipant => true
    _ => false
  }
  assert_true(denied)
  let early = try {
    @conversation.finish(planned(), 10, 1000) |> ignore
    false
  } catch {
    @conversation.NotStarted => true
    _ => false
  }
  assert_true(early)
}

///|
test "clock changes and repeated commands preserve lifecycle invariants" {
  for offset in 0..<1000 {
    let start = 10000.0 + offset.to_double()
    let active = @conversation.begin(planned(), 10, start)
    let ended = @conversation.finish(active, 20, 1)
    assert_eq(ended.ended_at, start)
    assert_eq(@conversation.state(ended), "completed")
    assert_eq(@conversation.finish(ended, 20, start + 9999).revision, 2)
  }
}

///|
test "event expiry and manual finish share a deadline; direct calls never expire" {
  let direct = @conversation.restore(planned()).change(
    Start,
    @identity.UserId::from_int(10),
    1000,
  )
  assert_eq(
    direct.change(Expire, @identity.UserId::from_int(20), 999999).revision(),
    1,
  )
  assert_eq(
    direct.change(Finish, @identity.UserId::from_int(20), 999999).snapshot().ended_at,
    999999,
  )
  let invitation = @conversation.restore(planned(), event_id=7, round=1)
  assert_eq(
    invitation.change(Expire, @identity.UserId::from_int(10), 999999).revision(),
    0,
  )
  let event = invitation.change(Start, @identity.UserId::from_int(10), 1000)
  assert_eq(
    event.change(Expire, @identity.UserId::from_int(20), 300999).revision(),
    1,
  )
  let expired = event.change(Expire, @identity.UserId::from_int(20), 301000)
  assert_eq(expired.snapshot().ended_at, 301000)
  assert_eq(
    event.change(Finish, @identity.UserId::from_int(20), 400000).snapshot().ended_at,
    301000,
  )
  assert_eq(
    expired.change(Finish, @identity.UserId::from_int(10), 999999).snapshot().ended_at,
    301000,
  )
  assert_eq(
    event.change(Finish, @identity.UserId::from_int(20), 1).snapshot().ended_at,
    1000,
  )
}
