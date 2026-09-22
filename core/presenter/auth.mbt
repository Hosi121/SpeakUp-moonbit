///|
pub(all) struct AuthRequest {
  submit : (Bool, String, String, String, (String, String) -> Unit) -> () -> Unit
}

///|
/// The host supplies a public HTTP primitive; parsing and payloads stay here.
pub fn create_auth_request(ports : AppPorts) -> AuthRequest {
  {
    submit: fn(signup, username, email, password, done) {
      let life = scope(ports)
      life.active = true
      let body : Json = if signup {
        {
          "username": username.to_json(),
          "email": email.to_json(),
          "password": password.to_json(),
        }
      } else {
        { "email": email.to_json(), "password": password.to_json() }
      }
      life.request(
        "auth",
        "POST",
        if signup {
          "/signup"
        } else {
          "/signin"
        },
        body,
        fn(text) raise {
          if signup {
            @shared.checked_signup_response(text) |> ignore
            done("", "")
          } else {
            done(@shared.checked_token_response(text), "")
          }
        },
        fn(error) { done("", error) },
      )
      fn() { life.stop() }
    },
  }
}
