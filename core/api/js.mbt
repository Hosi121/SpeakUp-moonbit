///|
async fn suspend(
  f : ((String) -> Unit, (HostError) -> Unit) -> Unit,
) -> String raise HostError = "%async.suspend"

///|
fn completion(f : (String, String) -> Unit) -> @platform.DispatchDoneCallback = "%identity"

///|
fn run(f : async () -> Unit noraise) -> Unit = "%async.run"

///|
fn init {
  configure_host({
    invoke: async fn(request) {
      let text = suspend(fn(ok, err) {
        @platform.dispatch(
          request.stringify(),
          completion(fn(error, value) {
            if error == "" {
              ok(value)
            } else {
              err(HostError(error))
            }
          }),
        )
      })
      @json.parse(text)
    },
    now: @platform.now,
    now_millis: @platform.nowMillis,
    public_url: @platform.publicUrl,
    event_times: @platform.eventTimes,
  })
}

///|
pub fn handle(
  verb : String,
  path : String,
  uid : Int,
  body : String,
  query_text : String,
  respond : (Int, String) -> Unit,
) -> Unit {
  run(async fn() noraise {
    let result = execute(verb, path, uid, body, query_text) catch {
      _ => { status: 500, body: "{\"error\":\"Request failed\"}", }
    }
    respond(result.status, result.body)
  })
}
