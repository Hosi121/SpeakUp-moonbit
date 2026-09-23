///|
pub(all) struct SocketPort {
  send : (String) -> Bool
  close : () -> Unit
}

///|
pub(all) struct RealtimePorts {
  socket : (String, (String, String) -> Unit) -> SocketPort
  visible : () -> Bool
  on_focus : (() -> Unit) -> () -> Unit
  notify : () -> Unit
}

///|
pub(all) struct NotificationView {
  value : @shared.NotificationDto
  description : String
  destination : String
}

///|
pub(all) struct ActivityView {
  revision : Int
  inbox : @shared.InboxDto
  items : Array[NotificationView]
  connected : Bool
  clockOffset : Double
  error : String
  open : Bool
  busy : Bool
  read_error : String
}

///|
pub(all) struct ActivityController {
  get_snapshot : () -> ActivityView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  refresh : () -> Unit
  set_open : (Bool) -> Unit
  read : () -> Unit
}

///|
fn Scope::schedule(
  self : Self,
  key : String,
  delay : Double,
  run : () -> Unit,
) -> Unit {
  self.run(
    key,
    fn(done) { (self.ports.timeout)(delay, fn() { done(200, "", false) }) },
    fn(_) { run() },
    fn(_) { () },
  )
}

///|
pub fn notification_view(value : @shared.NotificationDto) -> NotificationView {
  let description = match value.kind {
    "friend_request" => "フレンド申請が届きました"
    "friend_accepted" => "フレンド申請が承認されました"
    "call_invitation" => "通話への招待が届きました"
    "message" => "新しいメッセージがあります"
    "event_matched" => "イベントの通話相手が決まりました"
    _ => "通知があります"
  }
  {
    value,
    description,
    destination: if value.kind == "message" {
      "/message/\{value.actor.id}"
    } else if value.conversation_id > 0 {
      "/sessionlist"
    } else {
      "/friendrequest"
    },
  }
}

///|
pub fn create_activity(
  ports : AppPorts,
  realtime : RealtimePorts,
) -> ActivityController {
  let state = store(ActivityView::{
    revision: 0,
    inbox: { items: [], unread: 0, now: 0, },
    items: [],
    connected: false,
    clockOffset: 0,
    error: "",
    open: false,
    busy: false,
    read_error: "",
  })
  let life = scope(ports)
  let attempts = Ref(0)
  let receive = fn(inbox : @shared.InboxDto, offset : Double) {
    state.set({
      ..state.value,
      inbox,
      items: inbox.items.map(fn(value) {
        // checked_inbox validated the event and its required identifiers.
        let notice = try! value.notice()
        {
          value,
          description: notice.description(),
          destination: notice.destination(),
        }
      }),
      error: "",
      revision: state.value.revision + 1,
      clockOffset: offset,
    })
    (realtime.notify)()
  }
  let refresh = fn() {
    life.schedule("debounce", 100, fn() {
      let started = (ports.now)()
      life.request(
        "inbox",
        "GET",
        "/notifications",
        Json::null(),
        fn(text) raise {
          let inbox = @shared.checked_inbox(text)
          receive(
            inbox,
            (inbox.now - (started + (ports.now)()) / 2 + 0.5).floor(),
          )
        },
        fn(_) {
          state.set({
            ..state.value,
            error: "通知を取得できませんでした。",
            revision: state.value.revision + 1,
          })
          (realtime.notify)()
        },
      )
    })
  }
  let focus = fn() { if (realtime.visible)() { refresh() } }
  fn connect() {
    guard life.begin("socket") is Some(connection) else { return }
    let socket : Ref[SocketPort?] = Ref(None)
    let opened = Ref(false)
    let authorize = fn() {
      if connection.is_open() && opened.val && socket.val is Some(socket) {
        opened.val = false
        let auth : Json = { "token": ("Bearer " + (ports.token)()).to_json() }
        (socket.send)(auth.stringify()) |> ignore
      }
    }
    let value = (realtime.socket)("/activity", fn(kind, text) {
      if !connection.is_open() {
        return
      }
      match kind {
        "open" => {
          opened.val = true
          authorize()
        }
        "text" =>
          if text == "{\"type\":\"refresh\"}" {
            attempts.val = 0
            state.set({ ..state.value, connected: true, })
            refresh()
          }
        "error" | "close" => {
          life.cancel("socket")
          state.set({ ..state.value, connected: false, })
          let delay = [1000.0, 2000, 4000, 8000, 16000, 30000][attempts.val.min(
              5,
            )]
          attempts.val = (attempts.val + 1).min(5)
          life.schedule("reconnect", delay, connect)
        }
        _ => ()
      }
    })
    ignore(connection.own(value.close))
    socket.val = Some(value)
    authorize()
  }
  fn recover() {
    if !life.is_active() {
      return
    }
    life.schedule("recovery", 60000, fn() {
      focus()
      recover()
    })
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() {
      if life.is_active() {
        return
      }
      life.activate()
      attempts.val = 0
      state.set({ ..state.value, busy: false, connected: false, })
      if (ports.token)().is_empty() {
        return
      }
      life.watch(realtime.on_focus, focus)
      life.schedule("reconnect", 0, connect)
      refresh()
      recover()
    },
    stop: fn() { life.stop() },
    refresh,
    set_open: fn(open) { state.set({ ..state.value, open, }) },
    read: fn() {
      if !life.is_active() || state.value.busy {
        return
      }
      guard state.value.inbox.items.get(0) is Some(item) else { return }
      let revision = state.value.revision
      state.set({ ..state.value, busy: true, read_error: "", })
      life.cancel("inbox")
      life.request(
        "read",
        "PUT",
        "/notifications/read",
        { "through_id": item.id.to_json() },
        fn(text) raise {
          let inbox = @shared.checked_inbox(text)
          life.cancel("inbox")
          state.set({ ..state.value, busy: false, })
          if state.value.revision == revision {
            receive(inbox, state.value.clockOffset)
          } else {
            // A newer refresh may include a notification created after this
            // acknowledgement's snapshot. Reconcile without removing it.
            refresh()
          }
        },
        fn(_) {
          state.set({
            ..state.value,
            busy: false,
            read_error: "既読にできませんでした。",
          })
        },
      )
    },
  }
}
