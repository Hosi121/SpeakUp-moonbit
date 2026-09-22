///|
test "app discards abandoned modules and disposes a live page on stop" {
  let queued : Array[(@shell.PageRenderer) -> Unit] = []
  let mounted = Ref(0)
  let disposed = Ref(0)
  let watched = Ref(0)
  let controller = @shell.create_app({
    location: fn() { { pathname: "/login", conversation: "", token: "", } },
    on_location: fn(_) {
      watched.val += 1
      fn() { watched.val -= 1 }
    },
    navigate: fn(_, _) { () },
    load: fn(_, ready, _) { queued.push(ready) },
    load_activity: fn(_, _) { () },
    loading: fn() { () },
    not_found: fn() { () },
    failed: fn() { () },
  })
  let renderer : @shell.PageRenderer = {
    mount: fn(_) {
      mounted.val += 1
      fn() { disposed.val += 1 }
    },
  }
  (controller.start)()
  (controller.stop)()
  queued[0](renderer)
  assert_eq(mounted.val, 0)
  (controller.start)()
  queued[1](renderer)
  queued[1](renderer)
  assert_eq(mounted.val, 1)
  (controller.stop)()
  (controller.stop)()
  assert_eq(disposed.val, 1)
  assert_eq(watched.val, 0)
}
