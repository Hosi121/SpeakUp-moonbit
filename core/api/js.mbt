///|
fn completion(f : (String, String) -> Unit) -> @platform.DispatchDoneCallback = "%identity"

///|
fn init {
  configure_host({
    invoke: async fn(request) {
      let text = @bridge.await_text(fn(done) {
        @platform.dispatch(request.stringify(), completion(done))
      }) catch {
        @bridge.BridgeError(message) => raise HostError(message)
      }
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
  @bridge.run(async fn() noraise {
    let result = execute(verb, path, uid, body, query_text) catch {
      _ => { status: 500, body: "{\"error\":\"Request failed\"}", }
    }
    respond(result.status, result.body)
  })
}

///|
pub fn poll_expired(done : (Int, Array[Int]) -> Unit) -> Unit {
  @bridge.run(async fn() noraise {
    done(200, overdue_conversations()) catch {
      _ => done(500, [])
    }
  })
}

///|
pub fn expire(id : Int, done : (Int, String) -> Unit) -> Unit {
  @bridge.run(async fn() noraise {
    try {
      let result = expire_conversation(id)
      done(result.status, result.body)
    } catch {
      _ => done(500, "")
    }
  })
}
