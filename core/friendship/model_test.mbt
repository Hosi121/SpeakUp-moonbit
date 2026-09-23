///|
test "recipient consent and requester cancellation have distinct authority" {
  for requester in [@friendship.First, @friendship.Second] {
    let recipient = match requester {
      First => @friendship.Second
      Second => @friendship.First
    }
    let pending = @friendship.decide(Absent, Request, requester)
    @debug.assert_eq(pending.next, @friendship.Pending(requester))
    @debug.assert_eq(pending.notice, Some(@friendship.Notice::Requested))
    @debug.assert_eq(
      @friendship.decide(pending.next, Accept, recipient).next,
      @friendship.Accepted(requester),
    )
    @debug.assert_eq(
      @friendship.decide(pending.next, Cancel, requester).next,
      @friendship.Declined(requester),
    )
    @debug.assert_eq(
      @friendship.decide(pending.next, Reject, recipient).next,
      @friendship.Declined(requester),
    )
    let forbidden : Array[(@friendship.Action, @friendship.Member)] = [
      (Accept, requester),
      (Reject, requester),
      (Cancel, recipient),
      (Request, recipient),
    ]
    for (action, actor) in forbidden {
      let rejected = try @friendship.decide(pending.next, action, actor) catch {
        @friendship.Conflict => true
        _ => false
      } noraise {
        _ => false
      }
      assert_true(rejected)
    }
  }
}

///|
test "retries preserve consent and a declined request needs a fresh invitation" {
  let pending = @friendship.decide(Absent, Request, First)
  @debug.assert_eq(
    @friendship.decide(pending.next, Request, First).next,
    pending.next,
  )
  let accepted = @friendship.decide(pending.next, Accept, Second)
  @debug.assert_eq(
    @friendship.decide(accepted.next, Accept, Second).next,
    accepted.next,
  )
  @debug.assert_eq(
    @friendship.decide(accepted.next, Request, First).notice,
    None,
  )
  let declined = @friendship.decide(pending.next, Reject, Second)
  @debug.assert_eq(
    @friendship.decide(declined.next, Reject, Second).next,
    declined.next,
  )
  let late_accept = try
    @friendship.decide(declined.next, Accept, Second)
  catch {
    @friendship.Conflict => true
    _ => false
  } noraise {
    _ => false
  }
  assert_true(late_accept)
  let renewed = @friendship.decide(declined.next, Request, Second)
  @debug.assert_eq(renewed.next, @friendship.Pending(Second))
  @debug.assert_eq(
    @friendship.decide(renewed.next, Accept, First).next,
    @friendship.Accepted(Second),
  )
}

///|
test "missing and blocked relationships cannot be accepted or revived implicitly" {
  for actor in [@friendship.First, @friendship.Second] {
    for
      action in [
        @friendship.Request,
        @friendship.Accept,
        @friendship.Reject,
        @friendship.Cancel,
      ] {
      let blocked = try @friendship.decide(Blocked, action, actor) catch {
        @friendship.Conflict => true
        _ => false
      } noraise {
        _ => false
      }
      assert_true(blocked)
    }
    for action in [@friendship.Accept, @friendship.Reject, @friendship.Cancel] {
      let missing = try @friendship.decide(Absent, action, actor) catch {
        @friendship.NoPending => true
        _ => false
      } noraise {
        _ => false
      }
      assert_true(missing)
    }
  }
}
