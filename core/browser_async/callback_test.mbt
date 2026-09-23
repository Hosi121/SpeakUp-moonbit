///|
async test "synchronous completion is delivered once and unregisters cancellation" {
  let life = @lifetime.Lifetime()
  let cancelled = Ref(0)
  let result = @browser_async.wait(life, fn(done) {
    done(Ok(7))
    done(Ok(9))
    done(Err(@browser_async.PortError("duplicate failure")))
    fn() { cancelled.val += 1 }
  })
  assert_eq(result, 7)
  assert_eq(cancelled.val, 1)
  life.close()
  assert_eq(cancelled.val, 1)
}

///|
async test "close between completion and delivery releases the value and a late cancel handle" {
  let life = @lifetime.Lifetime()
  let released : Array[Int] = []
  let cancelled = Ref(0)
  let delivered = Ref(false)
  try {
    let _ : Int = @browser_async.wait(
      life,
      fn(done) {
        done(Ok(7))
        life.close()
        fn() { cancelled.val += 1 }
      },
      discard=fn(value) { released.push(value) },
    )
    delivered.val = true
  } catch {
    @browser_async.Stopped => ()
    error => raise error
  }
  assert_false(delivered.val)
  assert_eq(cancelled.val, 1)
  assert_eq(released.length(), 1)
  assert_eq(released[0], 7)
}

///|
async test "task group cancellation releases registration and disposes uncancellable late success" {
  let life = @lifetime.Lifetime()
  defer life.close()
  let entered : @async.Queue[Unit] = @async.Queue(kind=Blocking(1))
  let complete : Ref[((Result[Int, @browser_async.PortError]) -> Unit)?] = Ref(
    None,
  )
  let cancelled = Ref(0)
  let released = Ref(0)
  let delivered = Ref(false)
  @async.with_task_group(async fn(group) {
    group.spawn_bg(async fn() {
      let _ : Int = @browser_async.wait(
        life,
        fn(done) {
          complete.val = Some(done)
          ignore(try! entered.try_put(()))
          fn() { cancelled.val += 1 }
        },
        discard=fn(value) { released.val += value },
      )
      delivered.val = true
    })
    entered.get()
    raise @browser_async.PortError("group failed")
  }) catch {
    @browser_async.PortError(message) => assert_eq(message, "group failed")
    error => raise error
  }
  assert_false(delivered.val)
  assert_eq(cancelled.val, 1)
  complete.val.unwrap()(Ok(7))
  assert_eq(released.val, 7)
  assert_false(delivered.val)
}
