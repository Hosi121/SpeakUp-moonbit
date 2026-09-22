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
  set_field : (String, String) -> Unit
  show_password : (Bool) -> Unit
  submit : () -> Unit
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
  let active = Ref(false)
  let generation = Ref(0)
  let cancel = Ref(fn() { () })
  let update = fn(view) {
    state.val = view
    publish(listeners)
  }
  {
    get_snapshot: fn() { state.val },
    subscribe: fn(listener) { subscribe(listeners, next, listener) },
    start: fn() {
      if active.val {
        return
      }
      active.val = true
      update({ ..state.val, busy: false, })
    },
    stop: fn() {
      active.val = false
      generation.val += 1
      (cancel.val)()
      cancel.val = fn() { () }
    },
    preload: fn() { (ports.load)(fn(_) { () }, fn(_) { () }) },
    set_field: fn(field, value) {
      match field {
        "username" => update({ ..state.val, username: value, })
        "email" => update({ ..state.val, email: value, })
        "password" => update({ ..state.val, password: value, })
        _ => ()
      }
    },
    show_password: fn(showPassword) { update({ ..state.val, showPassword, }) },
    submit: fn() {
      if !active.val || state.val.busy {
        return
      }
      update({ ..state.val, busy: true, error: "", })
      generation.val += 1
      let current = generation.val
      let draft = state.val
      let started = Ref(false)
      let complete = Ref(false)
      let valid = fn() {
        active.val && current == generation.val && !complete.val
      }
      (ports.load)(
        fn(send) {
          if !valid() || started.val {
            return
          }
          started.val = true
          let abort = send(
            signup,
            draft.username,
            draft.email,
            draft.password,
            fn(token, error) {
              if !valid() {
                return
              }
              complete.val = true
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
          cancel.val = abort
          if !valid() {
            abort()
          }
        },
        fn(_) {
          if !valid() {
            return
          }
          complete.val = true
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
