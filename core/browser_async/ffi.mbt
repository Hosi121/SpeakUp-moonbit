///|
/// Promise values stay Unit: application values and errors remain in MoonBit.
extern "js" fn completion_promise(
  signal : @js_async.AbortSignal,
  register : (() -> Unit) -> Unit,
) -> @js_async.Promise[Unit] =
  #| (signal, register) => new Promise(resolve => {
  #|   const done = () => {
  #|     signal.removeEventListener('abort', done);
  #|     resolve(undefined);
  #|   };
  #|   signal.addEventListener('abort', done, {once: true});
  #|   if (signal.aborted) done();
  #|   else register(done);
  #| })

///|
extern "js" fn invoke(f : () -> Unit, failed : (String) -> Unit) -> Unit =
  #| (f, failed) => {
  #|   try { f(); }
  #|   catch (error) {
  #|     failed(error instanceof Error ? error.message : String(error));
  #|   }
  #| }

///|
pub fn[T] guard_sync(f : () -> T) -> T raise PortError {
  let value : Ref[Result[T, PortError]?] = Ref(None)
  invoke(fn() { value.val = Some(Ok(f())) }, fn(e) {
    value.val = Some(Err(PortError(e)))
  })
  match value.val {
    Some(Ok(v)) => v
    Some(Err(e)) => raise e
    None => abort("synchronous browser operation did not return")
  }
}

///|
/// Checked task errors are reported inside run; cancellation becomes AbortError
/// at the JS export boundary and still needs a rejection handler.
extern "js" fn observe_completion(
  p : @js_async.Promise[Unit],
  failed : (String) -> Unit,
) -> Unit =
  #| (p, failed) => {
  #|   void p.catch(error => {
  #|     if (error?.name !== 'AbortError') failed(String(error));
  #|   });
  #| }
