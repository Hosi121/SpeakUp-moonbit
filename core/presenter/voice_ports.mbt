///|
/// Browser callback conventions end here. The controller sees checked errors
/// and descriptions with a kind, rather than empty error strings and flags.
priv enum DescriptionKind {
  Offer
  Answer
}

///|
fn DescriptionKind::label(self : Self) -> String {
  match self {
    Offer => "offer"
    Answer => "answer"
  }
}

///|
fn[T] port_result(
  value : T,
  error : String,
) -> Result[T, @browser_async.PortError] {
  if error.is_empty() {
    Ok(value)
  } else {
    Err(@browser_async.PortError(error))
  }
}

///|
fn MeterPort::speaking(self : Self) -> Bool raise @browser_async.PortError {
  let data = @browser_async.guard_sync(fn() { (self.sample)() })
  sound_is_speaking(data)
}

///|
async fn PeerPort::describe_async(
  self : Self,
  life : @lifetime.Lifetime,
  kind : DescriptionKind,
) -> String {
  @browser_async.wait(life, fn(done) {
    (self.describe)(kind is Offer, fn(sdp, error) {
      done(port_result(sdp, error))
    })
    noop
  })
}

///|
async fn PeerPort::local_async(
  self : Self,
  life : @lifetime.Lifetime,
  kind : DescriptionKind,
  sdp : String,
) -> String {
  @browser_async.wait(life, fn(done) {
    (self.set_local)(kind.label(), sdp, fn(value, error) {
      done(port_result(value, error))
    })
    noop
  })
}

///|
async fn PeerPort::remote_async(
  self : Self,
  life : @lifetime.Lifetime,
  kind : DescriptionKind,
  sdp : String,
) -> Unit {
  @browser_async.wait(life, fn(done) {
    (self.remote)(kind.label(), sdp, fn(error) { done(port_result((), error)) })
    noop
  })
}

///|
async fn PeerPort::ice_async(
  self : Self,
  life : @lifetime.Lifetime,
  candidate : IceCandidate,
) -> Unit {
  @browser_async.wait(life, fn(done) {
    (self.ice)(candidate, fn(error) { done(port_result((), error)) })
    noop
  })
}

///|
async fn read_voice(
  ports : AppPorts,
  life : @lifetime.Lifetime,
  path : String,
) -> String {
  @browser_async.wait(life, fn(done) {
    (ports.request)("GET", path, "", fn(status, text, network_error) {
      done(
        if network_error {
          Err(
            @browser_async.PortError(
              "サーバーに接続できませんでした",
            ),
          )
        } else if status < 200 || status >= 300 {
          Err(@browser_async.PortError(http_error(status, text)))
        } else {
          Ok(text)
        },
      )
    })
  })
}

///|
fn candidate_port(value : @shared.Candidate) -> IceCandidate {
  {
    candidate: value.candidate,
    mid: value.mid.unwrap_or(""),
    has_mid: value.mid is Some(_),
    line: value.line.unwrap_or(-1),
    username: value.username.unwrap_or(""),
    has_username: value.username is Some(_),
  }
}

///|
fn ice_payload(candidate : IceCandidate) -> Json {
  {
    "type": "ice-candidate",
    "candidate": {
      "candidate": candidate.candidate.to_json(),
      "sdpMid": if candidate.has_mid {
        candidate.mid.to_json()
      } else {
        Json::null()
      },
      "sdpMLineIndex": if candidate.line >= 0 {
        candidate.line.to_json()
      } else {
        Json::null()
      },
      "usernameFragment": if candidate.has_username {
        candidate.username.to_json()
      } else {
        Json::null()
      },
    },
  }
}
