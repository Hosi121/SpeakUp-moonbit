///|
pub(all) struct AdminView {
  open : Bool
  dateTime : String
  theme : String
  topics : Array[String]
  success : String
  error : String
  dialogError : String
  created : Array[@shared.Event]
  section : String
  query : String
  users : Array[@shared.User]
  searched : Bool
  busy : Bool
}

///|
pub(all) struct AdminController {
  get_snapshot : () -> AdminView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  set_date_time : (String) -> Unit
  set_theme : (String) -> Unit
  set_query : (String) -> Unit
  set_section : (String) -> Unit
  set_topic : (Int, String) -> Unit
  open : () -> Unit
  close : () -> Unit
  create : () -> Unit
  generate : () -> Unit
  search : () -> Unit
}

///|
pub fn create_admin(ports : AppPorts) -> AdminController {
  let state = store(AdminView::{
    open: false,
    dateTime: "",
    theme: "",
    topics: ["", "", ""],
    success: "",
    error: "",
    dialogError: "",
    created: [],
    section: "events",
    query: "",
    users: [],
    searched: false,
    busy: false,
  })
  let life = scope(ports)
  let close = fn() {
    if !state.value.busy {
      state.set({
        ..state.value,
        open: false,
        dateTime: "",
        theme: "",
        topics: ["", "", ""],
        dialogError: "",
      })
    }
  }
  let failed = fn(message) {
    state.set({ ..state.value, busy: false, dialogError: message, })
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() {
      life.start(fn() { state.set({ ..state.value, busy: false, }) }, false)
    },
    stop: fn() { life.stop() },
    set_date_time: fn(value) {
      if !state.value.busy {
        state.set({ ..state.value, dateTime: value, })
      }
    },
    set_theme: fn(value) {
      if !state.value.busy {
        state.set({ ..state.value, theme: value, })
      }
    },
    set_query: fn(value) {
      if !state.value.busy {
        state.set({ ..state.value, query: value, })
      }
    },
    set_section: fn(value) {
      if !state.value.busy && (value == "events" || value == "users") {
        state.set({ ..state.value, section: value, })
      }
    },
    set_topic: fn(index, value) {
      if state.value.busy || index < 0 || index >= 3 {
        return
      }
      let topics = state.value.topics.copy()
      topics[index] = value
      state.set({ ..state.value, topics, })
    },
    open: fn() {
      if !state.value.busy {
        state.set({ ..state.value, open: true, error: "", success: "", })
      }
    },
    close,
    create: fn() {
      if !life.is_active() || state.value.busy {
        return
      }
      let date = (ports.iso)(state.value.dateTime)
      if date.is_empty() {
        failed("予定日時を入力してください。")
        return
      }
      state.set({ ..state.value, busy: true, dialogError: "", })
      life.request(
        "create",
        "POST",
        "/events",
        {
          "event_start": date.to_json(),
          "theme": state.value.theme.to_json(),
          "topics": state.value.topics.to_json(),
        },
        fn(text) raise {
          let created = @shared.checked_event_response(text)
          state.set({
            ..state.value,
            busy: false,
            created: [created],
            success: "イベントが正常に作成されました",
          })
          close()
        },
        failed,
      )
    },
    generate: fn() {
      if !life.is_active() || state.value.busy {
        return
      }
      state.set({ ..state.value, busy: true, dialogError: "", })
      life.request(
        "generate",
        "POST",
        "/chat/theme",
        { "content": "イベントのテーマを提案してください。" },
        fn(text) raise {
          state.set({
            ..state.value,
            theme: @shared.checked_chat_response(text),
            busy: false,
          })
        },
        fn(_) { failed("テーマの生成に失敗しました。") },
      )
    },
    search: fn() {
      if !life.is_active() || state.value.busy {
        return
      }
      state.set({ ..state.value, busy: true, error: "", })
      let query = (ports.encode)(state.value.query)
      life.request(
        "search",
        "GET",
        "/users/search?q=\{query}",
        Json::null(),
        fn(text) raise {
          state.set({
            ..state.value,
            users: @shared.checked_users_response(text),
            searched: true,
            busy: false,
          })
        },
        fn(_) {
          state.set({
            ..state.value,
            busy: false,
            error: "ユーザーの検索に失敗しました。",
          })
        },
      )
    },
  }
}
