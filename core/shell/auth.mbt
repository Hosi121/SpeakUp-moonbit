///|
pub(all) struct AuthView {
  username : String
  email : String
  password : String
  showPassword : Bool
  error : String
  busy : Bool
}

///|
pub(all) struct AuthPorts {
  load : (
    ((Bool, String, String, String, (String, String) -> Unit) -> () -> Unit) -> Unit,
    (String) -> Unit,
  ) -> Unit
  store_token : (String) -> Unit
  navigate : (String, Bool) -> Unit
}

///|
pub(all) struct AuthController {
  get_snapshot : () -> AuthView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  preload : () -> Unit
  set_username : (String) -> Unit
  set_email : (String) -> Unit
  set_password : (String) -> Unit
  set_field : (String, String) -> Unit
  show_password : (Bool) -> Unit
  submit : () -> Unit
}

///|
priv enum AuthField {
  Username
  Email
  Password
}

///|
priv struct AuthDraft {
  username : String
  email : String
  password : String
}

///|
priv enum AuthPhase {
  Stopped
  Idle
  Loading(Int, AuthDraft)
  Sending(Int, () -> Unit)
}

///|
pub fn create_auth(signup : Bool, ports : AuthPorts) -> AuthController {
  let state = Ref(AuthView::{
    username: "",
    email: "",
    password: "",
    showPassword: false,
    error: "",
    busy: false,
  })
  let listeners : Array[Listener] = []
  let next = Ref(0)
  let sequence = Ref(0)
  let phase : Ref[AuthPhase] = Ref(Stopped)
  let update = fn(view) {
    state.val = view
    publish(listeners)
  }
  let set_field = fn(field : AuthField, value : String) {
    match field {
      Username => update({ ..state.val, username: value, })
      Email => update({ ..state.val, email: value, })
      Password => update({ ..state.val, password: value, })
    }
  }
  {
    get_snapshot: fn() { state.val },
    subscribe: fn(listener) { subscribe(listeners, next, listener) },
    start: fn() {
      guard phase.val is Stopped else { return }
      phase.val = Idle
      update({ ..state.val, busy: false, })
    },
    stop: fn() {
      let previous = phase.val
      phase.val = Stopped
      if previous is Sending(_, cancel) {
        cancel()
      }
    },
    preload: fn() { (ports.load)(fn(_) { () }, fn(_) { () }) },
    set_username: fn(value) { set_field(Username, value) },
    set_email: fn(value) { set_field(Email, value) },
    set_password: fn(value) { set_field(Password, value) },
    set_field: fn(field, value) {
      match field {
        "username" => set_field(Username, value)
        "email" => set_field(Email, value)
        "password" => set_field(Password, value)
        _ => ()
      }
    },
    show_password: fn(showPassword) { update({ ..state.val, showPassword, }) },
    submit: fn() {
      guard phase.val is Idle else { return }
      sequence.val += 1
      let current = sequence.val
      phase.val = Loading(current, {
        username: state.val.username,
        email: state.val.email,
        password: state.val.password,
      })
      update({ ..state.val, busy: true, error: "", })
      (ports.load)(
        fn(send) {
          guard phase.val is Loading(id, draft) && id == current else { return }
          // Install the stage before calling the port: completion may be synchronous.
          phase.val = Sending(current, fn() { () })
          let abort = send(
            signup,
            draft.username,
            draft.email,
            draft.password,
            fn(token, error) {
              guard phase.val is Sending(id, _) && id == current else { return }
              phase.val = Idle
              update({ ..state.val, busy: false, error, })
              if !error.is_empty() {
                return
              }
              if !signup {
                (ports.store_token)(token)
              }
              (ports.navigate)(if signup { "/login" } else { "/home" }, false)
            },
          )
          if phase.val is Sending(id, _) && id == current {
            phase.val = Sending(current, abort)
          } else {
            abort()
          }
        },
        fn(_) {
          guard phase.val is Loading(id, _) && id == current else { return }
          phase.val = Idle
          update({
            ..state.val,
            busy: false,
            error: "認証機能を読み込めませんでした。ページを再読み込みして、もう一度お試しください。",
          })
        },
      )
    },
  }
}
