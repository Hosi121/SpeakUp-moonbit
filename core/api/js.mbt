///|
fn completion(f : (String, String) -> Unit) -> @platform.DispatchDoneCallback = "%identity"

///|
async fn dispatch(request : Json) -> Json {
  let text = @bridge.await_text(fn(done) {
    @platform.dispatch(request.stringify(), completion(done))
  }) catch {
    @bridge.BridgeError("credentials") => raise HostError::Credentials
    @bridge.BridgeError("not_configured") => raise HostError::NotConfigured
    @bridge.BridgeError("conflict") => raise HostError::Conflict
    _ => raise HostError::Unavailable
  }
  @json.parse(text)
}

///|
let node_notifier : Ref[(Int) -> Unit] = Ref(fn(_) { () })

///|
/// The Node entrypoint owns one instance. The backend has no mutable global host.
let node_api : Api = Api(
  {
    database: {
      run: async fn(statement) {
        decode_db_result(
          dispatch({
            "operation": "database",
            "sql": statement.sql.to_json(),
            "params": statement.params.to_json(),
          }),
        )
      },
      transaction: async fn(statements) {
        decode_db_result(
          dispatch({
            "operation": "transaction",
            "statements": statements.to_json(),
          }),
        )
      },
    },
    authenticate: async fn(action, credentials) {
      dispatch({
        "operation": (match action {
          SignIn => "signin"
          SignUp => "signup"
        }).to_json(),
        "email": credentials.email.to_json(),
        "password": credentials.password.to_json(),
      })
      |> ignore
    },
    issue_token: async fn(user) {
      @json.from_json(
        dispatch({ "operation": "issue_token", "user_id": user.to_json() }),
      )
    },
    chat: async fn(kind, content) {
      ChatReply::decode(
        dispatch({
          "operation": "chat",
          "kind": (match kind {
            Ask => "/chat/ask"
            Theme => "/chat/theme"
            Feedback => "/chat/feedback"
          }).to_json(),
          "content": content.to_json(),
        }),
      )
    },
    now: @platform.now,
    now_millis: @platform.nowMillis,
    public_url: @platform.publicUrl,
    event_times: fn(value) {
      let text = @platform.eventTimes(value)
      if text.is_empty() {
        None
      } else {
        Some(@json.from_json(@json.parse(text))) catch {
          _ => None
        }
      }
    },
  },
  notify=fn(user) { (node_notifier.val)(user.value()) },
)

///|
pub fn set_notifier(listener : (Int) -> Unit) -> Unit {
  node_notifier.val = listener
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
    let result = node_api.execute(verb, path, uid, body, query_text) catch {
      _ => { status: 500, body: "{\"error\":\"Request failed\"}", }
    }
    respond(result.status, result.body)
  })
}

///|
pub fn poll_expired(done : (Int, Array[Int]) -> Unit) -> Unit {
  @bridge.run(async fn() noraise {
    done(200, node_api.overdue_conversations().map(fn(id) { id.value() })) catch {
      _ => done(500, [])
    }
  })
}

///|
pub fn expire(id : Int, done : (Int, String) -> Unit) -> Unit {
  @bridge.run(async fn() noraise {
    try {
      let result = node_api.expire_conversation(
        @identity.ConversationId::from_int(id),
      )
      done(result.status, result.body)
    } catch {
      _ => done(500, "")
    }
  })
}
