///|
fn ports(
  request : (String, String, String, (Double, String, Bool) -> Unit) -> () -> Unit,
) -> @presenter.AppPorts {
  {
    request,
    now: fn() { 1000 },
    number: fn(_) { 42 },
    date: fn(_) { 0 },
    iso: fn(s) { s },
    encode: fn(s) { s },
    random_id: fn() { "id" },
    navigate: fn(_, _) { () },
    token: fn() { "token" },
    store_token: fn(_) { () },
    timeout: fn(_, _) { fn() { () } },
    on_activity: fn(_) { fn() { () } },
  }
}

///|
test "memo disposal and restart reject stale callbacks on both targets" {
  let callbacks : Array[(Double, String, Bool) -> Unit] = []
  let canceled = Ref(0)
  let controller = @presenter.create_memo(
    ports(fn(_, _, _, done) {
      callbacks.push(done)
      fn() { canceled.val += 1 }
    }),
  )
  (controller.start)()
  (controller.stop)()
  (controller.start)()
  callbacks[1](200, "{\"memo1\":\"current\",\"memo2\":\"\"}", false)
  (controller.set_memo)("draft")
  callbacks[0](200, "{\"memo1\":\"stale\"}", false)
  assert_eq((controller.get_snapshot)().carryInMemo, "draft")
  assert_true(canceled.val >= 1)
  (controller.stop)()
}

///|
test "synchronous requests permit one completion and validate structured errors" {
  let count = Ref(0)
  let controller = @presenter.create_memo(
    ports(fn(verb, _, _, done) {
      count.val += 1
      if verb == "GET" {
        done(200, "{}", false)
      } else {
        done(422, "{\"message\":{},\"detail\":\"invalid\"}", false)
      }
      done(200, "{\"memo1\":\"duplicate\"}", false)
      fn() { () }
    }),
  )
  (controller.start)()
  (controller.set_memo)("draft")
  (controller.save)()
  assert_eq((controller.get_snapshot)().error, "invalid")
  assert_eq((controller.get_snapshot)().carryInMemo, "draft")
  assert_eq(count.val, 2)
  (controller.stop)()
}

///|
test "survey retains previous snapshots and bounds answers" {
  let controller = @presenter.create_learning(
    ports(fn(_, _, _, done) {
      done(
        200, "{\"answers\":[],\"feedback\":\"\",\"feedback_current\":false,\"updated_at\":\"\"}",
        false,
      )
      fn() { () }
    }),
    "42",
    false,
  )
  (controller.start)()
  let before = (controller.get_snapshot)()
  (controller.answer)(0, 2)
  (controller.answer)(8, 0)
  (controller.answer)(1, 4)
  assert_eq(before.answers[0], 1)
  assert_eq((controller.get_snapshot)().answers[0], 2)
  assert_eq((controller.get_snapshot)().answers[1], 1)
  (controller.stop)()
}
