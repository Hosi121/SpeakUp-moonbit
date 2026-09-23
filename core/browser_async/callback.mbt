///|
pub(all) suberror PortError {
  PortError(String)
}

///|
pub(all) suberror Stopped

///|
pub fn check(life : @lifetime.Lifetime) -> Unit raise Stopped {
  if !life.is_open() {
    raise Stopped
  }
}

///|
priv enum Completion[T] {
  Pending
  Ready(Result[T, PortError])
  Taken
  Closed
}

///|
/// Turn a one-shot callback into a cancellable async operation.
/// `discard` owns successful values which cannot be delivered to the caller.
/// Every success callback transfers ownership of a fresh value; it must not
/// replay an already transferred resource. Cleanup functions must not throw.
pub async fn[T] wait(
  life : @lifetime.Lifetime,
  register : ((Result[T, PortError]) -> Unit) -> () -> Unit,
  discard? : (T) -> Unit = fn(_) {  },
) -> T {
  check(life)
  let state : Ref[Completion[T]] = Ref(Pending)
  let wake : Ref[() -> Unit] = Ref(fn() {  })
  let operation = life.child()
  defer operation.close()
  ignore(
    operation.own(fn() {
      let previous = state.val
      state.val = Closed
      if previous is Ready(Ok(value)) {
        discard(value)
      }
      (wake.val)()
    }),
  )
  let complete = fn(result : Result[T, PortError]) {
    match state.val {
      Pending => {
        state.val = Ready(result)
        (wake.val)()
      }
      Ready(_) | Taken | Closed => if result is Ok(value) { discard(value) }
    }
  }
  let controller = @js_async.AbortController::new()
  let promise = completion_promise(controller.signal(), fn(notify) {
    wake.val = notify
    if operation.is_open() {
      try {
        let cancel = guard_sync(fn() { register(complete) })
        ignore(operation.own(cancel))
      } catch {
        error => complete(Err(error))
      }
    } else {
      notify()
    }
  })
  promise.wait(abort_controller=controller)
  check(life)
  match state.val {
    Ready(Ok(value)) => {
      state.val = Taken
      value
    }
    Ready(Err(error)) => raise error
    Closed => raise Stopped
    Pending | Taken => abort("callback resumed without a result")
  }
}

///|
/// The only sync-to-async entry. Each browser lifecycle gets a task group;
/// all work below it stays in that group. close also releases resources
/// synchronously, before the JS event loop resumes cancelled tasks.
pub fn run(
  life : @lifetime.Lifetime,
  task : async (@async.TaskGroup[Unit]) -> Unit,
  failed : (Error) -> Unit,
) -> Unit {
  if !life.is_open() {
    return
  }
  let controller = @js_async.AbortController::new()
  ignore(life.own(fn() { controller.abort() }))
  let promise = @js_async.Promise::from_async(
    abort_signal=controller.signal(),
    async fn() {
      defer life.close()
      @async.with_task_group(task) catch {
        Stopped => ()
        error =>
          if life.is_open() {
            life.close()
            failed(error)
          }
      }
    },
  )
  observe_completion(promise, fn(message) { failed(PortError(message)) })
}
