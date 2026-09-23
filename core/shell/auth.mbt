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
  Loading(AuthDraft)
  Sending
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
  let owner : Ref[@lifetime.Lifetime?] = Ref(None)
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
      owner.val = Some(@lifetime.Lifetime())
      phase.val = Idle
      update({ ..state.val, busy: false, })
    },
    stop: fn() {
      phase.val = Stopped
      let previous = owner.val
      owner.val = None
      if previous is Some(life) {
        life.close()
      }
    },
    preload: fn() { (ports.load)(fn(_) { () }, fn(_) { () }) },
    set_username: fn(value) { set_field(Username, value) },
    set_email: fn(value) { set_field(Email, value) },
    set_password: fn(value) { set_field(Password, value) },
    show_password: fn(showPassword) { update({ ..state.val, showPassword, }) },
    submit: fn() {
      guard phase.val is Idle else { return }
      let parent = owner.val.unwrap()
      let current = parent.child()
      phase.val = Loading({
        username: state.val.username,
        email: state.val.email,
        password: state.val.password,
      })
      update({ ..state.val, busy: true, error: "", })
      if !current.is_open() {
        return
      }
      (ports.load)(
        fn(send) {
          guard current.is_open() && phase.val is Loading(draft) else { return }
          // Install the stage before calling the port: completion may be synchronous.
          phase.val = Sending
          let abort = send(
            signup,
            draft.username,
            draft.email,
            draft.password,
            fn(token, error) {
              guard current.is_open() && phase.val is Sending else { return }
              phase.val = Idle
              current.close()
              if !parent.is_open() {
                return
              }
              update({ ..state.val, busy: false, error, })
              if !parent.is_open() || !error.is_empty() {
                return
              }
              if !signup {
                (ports.store_token)(token)
              }
              if !parent.is_open() {
                return
              }
              (ports.navigate)(if signup { "/login" } else { "/home" }, false)
            },
          )
          ignore(current.own(abort))
        },
        fn(_) {
          guard current.is_open() && phase.val is Loading(_) else { return }
          phase.val = Idle
          current.close()
          if !parent.is_open() {
            return
          }
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
