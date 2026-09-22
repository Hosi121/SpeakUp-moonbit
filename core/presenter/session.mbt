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
  set_open : (String, Bool) -> Unit
  set_tab : (String) -> Unit
  set_draft : (String) -> Unit
  send : () -> Unit
  retry : () -> Unit
  finish : () -> Unit
  cancel : () -> Unit
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
  let offset = Ref(0.0)
  let connection = Ref("connecting")
  let voice : Ref[VoiceController] = Ref({
    start: noop,
    stop: noop,
    mute: fn(_) { () },
  })
  fn derive_view() {
    guard state.value.conversation.get(0) is Some(call) else { return }
    let clock = @shared.conversation_clock(call, (ports.now)() + offset.val) catch {
      _ => return
    }
    let partner = @shared.conversation_partner(call, state.value.me.id) catch {
      _ => state.value.partner
    }
    let status = if clock.phase == "active" {
      if !state.value.error.is_empty() {
        "通話は中断しています"
      } else if connection.val != "connected" {
        "再接続しています"
      } else if clock.has_deadline {
        "通話中：残り \{clock.remaining_seconds} 秒"
      } else {
        "通話中"
      }
    } else if clock.phase == "cancelled" {
      "通話はキャンセルされました"
    } else {
      "相手の接続を待っています"
    }
    state.set({
      ..state.value,
      status,
      partner,
      can_finish: clock.can_finish,
      can_cancel: clock.phase == "planned",
      can_retry: clock.can_join && !state.value.error.is_empty(),
    })
    life.cancel("clock")
    if clock.phase == "active" {
      life.schedule("clock", 1000, derive_view)
    }
    if !clock.can_join {
      (voice.val.stop)()
    }
    if clock.phase == "completed" && life.active {
      (ports.navigate)("/sessionrecord?conversation=\{id}", true)
    }
  }
  let receive = fn(call : @shared.ConversationDto) {
    if !life.active || call.id != id {
      return
    }
    if state.value.conversation.get(0) is Some(current) &&
      current.revision > call.revision {
      return
    }
    state.set({ ..state.value, conversation: [call], })
    derive_view()
  }
  let error = fn(message) {
    state.set({ ..state.value, error: message, saving: false, })
    derive_view()
  }
  voice.val = create_voice(ports, realtime, media, id, {
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
  let end_call = fn(action : String) {
    if !life.active || state.value.saving {
      return
    }
    if action == "finish" && !state.value.can_finish {
      return
    }
    if action == "cancel" && !state.value.can_cancel {
      return
    }
    state.set({ ..state.value, saving: true, })
    life.request(
      "ending",
      "POST",
      "/conversations/\{id}/\{action}",
      {},
      fn(text) raise {
        let call = @shared.parse_conversation(text)
        guard call.id == id else { fail("Wrong conversation") }
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
      if life.active || id == 0 {
        return
      }
      life.active = true
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
    set_open: fn(dialog, open) {
      match dialog {
        "memo" => state.set({ ..state.value, memo_open: open, })
        "assistant" => state.set({ ..state.value, assistant_open: open, })
        "topic" => state.set({ ..state.value, topic_open: open, })
        _ => ()
      }
    },
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
      if !life.active ||
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
      if !life.active || !state.value.can_retry {
        return
      }
      (voice.val.stop)()
      state.set({ ..state.value, error: "", can_retry: false, })
      (voice.val.start)()
    },
    finish: fn() { end_call("finish") },
    cancel: fn() { end_call("cancel") },
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
