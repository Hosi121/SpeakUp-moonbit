///|
pub(all) suberror BridgeError {
  BridgeError(String)
}

///|
async fn suspend(
  f : ((String) -> Unit, (BridgeError) -> Unit) -> Unit,
) -> String raise BridgeError = "%async.suspend"

///|
/// An error-first text callback is deliberately concrete: neither side exposes
/// runtime-specific objects. Empty error means success; first completion wins.
pub async fn await_text(
  start : ((String, String) -> Unit) -> Unit,
) -> String raise BridgeError {
  suspend(fn(ok, err) {
    let finished : Ref[Bool] = { val: false, }
    start(fn(error, value) {
      if !finished.val {
        finished.val = true
        if error.is_empty() {
          ok(value)
        } else {
          err(BridgeError(error))
        }
      }
    })
  })
}

///|
pub fn run(f : async () -> Unit noraise) -> Unit = "%async.run"
