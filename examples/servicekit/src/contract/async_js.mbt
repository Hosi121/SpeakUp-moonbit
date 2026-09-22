///|
fn completion(f : (String, String) -> Unit) -> @platform.EchoDoneCallback = "%identity"

///|
pub fn echo(value : String, done : (String, String) -> Unit) -> Unit {
  @bridge.run(async fn() noraise {
    try {
      let result = @bridge.await_text(fn(callback) {
        @platform.echo(value, completion(callback))
      })
      done("", result)
    } catch {
      @bridge.BridgeError(message) => done(message, "")
    }
  })
}
