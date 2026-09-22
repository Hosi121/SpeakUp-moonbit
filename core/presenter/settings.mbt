///|
pub(all) struct Upload {
  send : (String, String, String, (Double, String, Bool) -> Unit) -> () -> Unit
}

///|
pub(all) struct SettingsView {
  user : @shared.UserProfile
  loaded : Bool
  editing : String
  draft : String
  busy : Bool
  error : String
}

///|
pub(all) struct SettingsController {
  get_snapshot : () -> SettingsView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  edit : (String) -> Unit
  set_draft : (String) -> Unit
  save : () -> Unit
  upload : (Upload) -> Unit
  logout : () -> Unit
}

///|
pub fn create_settings(ports : AppPorts) -> SettingsController {
  let state = store(SettingsView::{
    user: empty_user(),
    loaded: false,
    editing: "",
    draft: "",
    busy: false,
    error: "",
  })
  let life = scope(ports)
  let failed = fn(message) {
    state.set({ ..state.value, busy: false, error: message, })
  }
  let refresh = fn() {
    state.set({ ..state.value, busy: false, })
    life.request(
      "profile",
      "GET",
      "/user/info",
      Json::null(),
      fn(text) raise {
        state.set({
          ..state.value,
          user: @shared.checked_profile_response(text),
          loaded: true,
        })
      },
      fn(_) { failed("ユーザー情報を取得できませんでした。") },
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() { life.start(refresh, false) },
    stop: fn() { life.stop() },
    edit: fn(field) {
      if state.value.busy || !state.value.loaded {
        return
      }
      match field {
        "username" =>
          state.set({
            ..state.value,
            editing: field,
            draft: state.value.user.username,
          })
        "email" =>
          state.set({
            ..state.value,
            editing: field,
            draft: state.value.user.email,
          })
        "" => state.set({ ..state.value, editing: "", })
        _ => ()
      }
    },
    set_draft: fn(draft) {
      if !state.value.busy {
        state.set({ ..state.value, draft, })
      }
    },
    save: fn() {
      if !life.active ||
        state.value.busy ||
        !state.value.loaded ||
        state.value.editing.is_empty() {
        return
      }
      let field = state.value.editing
      let draft = state.value.draft
      let body : Json = if field == "username" {
        { "username": draft.to_json() }
      } else {
        { "email": draft.to_json() }
      }
      state.set({ ..state.value, busy: true, error: "", })
      life.request(
        "save",
        "PUT",
        "/user/update",
        body,
        fn(_) {
          let user = if field == "username" {
            { ..state.value.user, username: draft, }
          } else {
            { ..state.value.user, email: draft, }
          }
          state.set({ ..state.value, user, editing: "", busy: false, })
        },
        failed,
      )
    },
    upload: fn(upload) {
      if !life.active || state.value.busy || !state.value.loaded {
        return
      }
      state.set({ ..state.value, busy: true, error: "", })
      life.run(
        "upload",
        fn(done) { (upload.send)("PUT", "/user/avatar", "avatar", done) },
        fn(text) raise {
          state.set({
            ..state.value,
            user: {
              ..state.value.user,
              avatarUrl: @shared.checked_avatar_response(text),
            },
            busy: false,
          })
        },
        failed,
      )
    },
    logout: fn() {
      life.stop()
      (ports.store_token)("")
      (ports.navigate)("/login", true)
    },
  }
}
