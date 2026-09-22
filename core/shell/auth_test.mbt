///|
test "abandoned deferred auth cannot submit or navigate" {
  let queued : Array[
    ((Bool, String, String, String, (String, String) -> Unit) -> () -> Unit) -> Unit,
  ] = []
  let sent = Ref(false)
  let navigated = Ref(false)
  let controller = @shell.create_auth(false, {
    load: fn(done, _) { queued.push(done) },
    store_token: fn(_) { () },
    navigate: fn(_, _) { navigated.val = true },
  })
  (controller.start)()
  (controller.submit)()
  (controller.submit)()
  (controller.stop)()
  queued[0](fn(_, _, _, _, done) {
    sent.val = true
    done("token", "")
    fn() { () }
  })
  assert_eq(queued.length(), 1)
  assert_false(sent.val)
  assert_false(navigated.val)
}
