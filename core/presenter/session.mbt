///|
pub(all) struct AssistantLine {
  body : String
  own : Bool
}

///|
pub(all) struct SessionView {
  id : Int
  conversation : Array[@shared.ConversationDto]
  me : @shared.UserProfile
  partner : @shared.FriendSummaryDto
  status : String
  can_finish : Bool
  can_cancel : Bool
  can_retry : Bool
  muted : Bool
  speaking : Bool
  remote_speaking : Bool
  error : String
  saving : Bool
  memo_open : Bool
  assistant_open : Bool
  topic_open : Bool
  memo_tab : String
  carryInMemo : String
  wordList : String
  messages : Array[AssistantLine]
  draft : String
  sending : Bool
}

///|
pub(all) struct SessionController {
  get_snapshot : () -> SessionView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  set_offset : (Double) -> Unit
  toggle_mute : () -> Unit
  open_memo : (Bool) -> Unit
  open_assistant : (Bool) -> Unit
  open_topic : (Bool) -> Unit
  set_tab : (String) -> Unit
  set_draft : (String) -> Unit
  send : () -> Unit
  retry : () -> Unit
  finish : () -> Unit
  cancel : () -> Unit
}

///|
priv enum EndCall {
  Finish
  Cancel
}

///|
pub fn create_session(
  ports : AppPorts,
  realtime : RealtimePorts,
  media : MediaPorts,
  raw : String,
) -> SessionController {
  let id = identifier((ports.number)(raw))
  let state = store(SessionView::{
    id,
    conversation: [],
    me: empty_user(),
    partner: { id: 0, username: "", avatar_url: "", },
    status: "相手の接続を待っています",
    can_finish: false,
    can_cancel: false,
    can_retry: false,
    muted: false,
    speaking: false,
    remote_speaking: false,
    error: "",
    saving: false,
    memo_open: false,
    assistant_open: false,
    topic_open: false,
    memo_tab: "1",
    carryInMemo: "",
    wordList: "",
    messages: [],
    draft: "",
    sending: false,
  })
  let life = scope(ports)
  let current : Ref[@shared.Call?] = Ref(None)
  let offset = Ref(0.0)
  let connection : Ref[CallConnection] = Ref(Connecting)
  let voice : Ref[VoiceController] = Ref({
    start: noop,
    stop: noop,
    mute: fn(_) { () },
  })
  fn derive_view() {
    guard current.val is Some(call) else { return }
    let clock = call.clock((ports.now)() + offset.val) catch { _ => return }
    let partner = call.partner(state.value.me.id) catch {
      _ => state.value.partner
    }
    let status = if call.model.phase() is Active(_) {
      if !state.value.error.is_empty() {
        "通話は中断しています"
      } else if !(connection.val is Connected) {
        "再接続しています"
      } else if clock.has_deadline {
        "通話中：残り \{clock.remaining_seconds} 秒"
      } else {
        "通話中"
      }
    } else if call.model.phase() is Cancelled(_) {
      "通話はキャンセルされました"
    } else {
      "相手の接続を待っています"
    }
    state.set({
      ..state.value,
      status,
      partner,
      can_finish: clock.can_finish,
      can_cancel: call.model.phase() is Planned,
      can_retry: clock.can_join && !state.value.error.is_empty(),
    })
    life.cancel("clock")
    if call.model.phase() is Active(_) {
      life.schedule("clock", 1000, derive_view)
    }
    if !clock.can_join {
      (voice.val.stop)()
    }
    if call.model.phase() is Completed(_, _) && life.is_active() {
      (ports.navigate)("/sessionrecord?conversation=\{id}", true)
    }
  }
  let receive = fn(call : @shared.Call) {
    if !life.is_active() || call.model.id().value() != id {
      return
    }
    if current.val is Some(previous) &&
      previous.model.revision() > call.model.revision() {
      return
    }
    current.val = Some(call)
    state.set({ ..state.value, conversation: [call.dto()], })
    derive_view()
  }
  let error = fn(message) {
    state.set({ ..state.value, error: message, saving: false, })
    derive_view()
  }
  voice.val = create_call_voice(ports, realtime, media, id, {
    conversation: receive,
    connection: fn(value) {
      connection.val = value
      derive_view()
    },
    error,
    speaking: fn(speaking, remote_speaking) {
      if state.value.speaking != speaking ||
        state.value.remote_speaking != remote_speaking {
        state.set({ ..state.value, speaking, remote_speaking, })
      }
    },
  })
  let end_call = fn(action : EndCall) {
    if !life.is_active() || state.value.saving {
      return
    }
    guard current.val is Some(call) else { return }
    let path = match (action, call.model.phase()) {
      (Finish, Active(_)) => "finish"
      (Cancel, Planned) => "cancel"
      (Finish, Planned | Completed(_, _) | Cancelled(_)) => return
      (Cancel, Active(_) | Completed(_, _) | Cancelled(_)) => return
    }
    state.set({ ..state.value, saving: true, })
    life.request(
      "ending",
      "POST",
      "/conversations/\{id}/\{path}",
      {},
      fn(text) raise {
        let call = @shared.parse_call(text)
        guard call.model.id().value() == id else { fail("Wrong conversation") }
        state.set({ ..state.value, saving: false, })
        receive(call)
      },
      error,
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() {
      if life.is_active() || id == 0 {
        return
      }
      life.activate()
      state.set({ ..state.value, error: "", saving: false, sending: false, })
      life.request(
        "memo",
        "GET",
        "/memo",
        Json::null(),
        fn(text) raise {
          let memo = @shared.checked_memo_response(text)
          state.set({
            ..state.value,
            carryInMemo: memo.carryInMemo,
            wordList: memo.wordList,
          })
        },
        fn(_) { () },
      )
      life.request(
        "me",
        "GET",
        "/user/info",
        Json::null(),
        fn(text) raise {
          state.set({
            ..state.value,
            me: @shared.checked_profile_response(text),
          })
          derive_view()
        },
        fn(_) { error("ユーザー情報を取得できませんでした") },
      )
      (voice.val.start)()
    },
    stop: fn() {
      life.stop()
      (voice.val.stop)()
    },
    set_offset: fn(value) {
      if value != offset.val {
        offset.val = value
        derive_view()
      }
    },
    toggle_mute: fn() {
      let muted = !state.value.muted
      state.set({ ..state.value, muted, })
      (voice.val.mute)(muted)
    },
    open_memo: fn(open) { state.set({ ..state.value, memo_open: open, }) },
    open_assistant: fn(open) {
      state.set({ ..state.value, assistant_open: open, })
    },
    open_topic: fn(open) { state.set({ ..state.value, topic_open: open, }) },
    set_tab: fn(tab) {
      if tab == "1" || tab == "2" {
        state.set({ ..state.value, memo_tab: tab, })
      }
    },
    set_draft: fn(draft) {
      if !state.value.sending {
        state.set({ ..state.value, draft, })
      }
    },
    send: fn() {
      if !life.is_active() ||
        state.value.sending ||
        trim(state.value.draft).is_empty() {
        return
      }
      let content = state.value.draft
      state.set({
        ..state.value,
        sending: true,
        draft: "",
        messages: append_line(state.value.messages, {
          body: "You: \{content}",
          own: true,
        }),
      })
      life.request(
        "assistant",
        "POST",
        "/chat/ask",
        { "content": content.to_json() },
        fn(text) raise {
          let response = @shared.checked_chat_response(text)
          state.set({
            ..state.value,
            sending: false,
            messages: append_line(state.value.messages, {
              body: "Assistant: \{response}",
              own: false,
            }),
          })
        },
        fn(message) {
          state.set({
            ..state.value,
            sending: false,
            messages: append_line(state.value.messages, {
              body: "Error: \{message}",
              own: false,
            }),
          })
        },
      )
    },
    retry: fn() {
      if !life.is_active() || !state.value.can_retry {
        return
      }
      (voice.val.stop)()
      state.set({ ..state.value, error: "", can_retry: false, })
      (voice.val.start)()
    },
    finish: fn() { end_call(Finish) },
    cancel: fn() { end_call(Cancel) },
  }
}

///|
fn append_line(
  lines : Array[AssistantLine],
  line : AssistantLine,
) -> Array[AssistantLine] {
  let result = lines.copy()
  result.push(line)
  result
}
