///|
pub(all) struct MemoView {
  carryInMemo : String
  wordList : String
  busy : Bool
  error : String
  saved : Bool
}

///|
pub(all) struct MemoController {
  get_snapshot : () -> MemoView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  set_memo : (String) -> Unit
  set_words : (String) -> Unit
  save : () -> Unit
}

///|
pub fn create_memo(ports : AppPorts) -> MemoController {
  let state = store(MemoView::{
    carryInMemo: "",
    wordList: "",
    busy: true,
    error: "",
    saved: false,
  })
  let life = scope(ports)
  let failed = fn(message) {
    state.set({ ..state.value, busy: false, error: message, })
  }
  let refresh = fn() {
    state.set({ ..state.value, busy: true, })
    life.request(
      "memo",
      "GET",
      "/memo",
      Json::null(),
      fn(text) raise {
        let data = @shared.checked_memo_response(text)
        state.set({
          ..state.value,
          carryInMemo: data.carryInMemo,
          wordList: data.wordList,
          busy: false,
          error: "",
        })
      },
      fn(_) { failed("メモを取得できませんでした。") },
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() { life.start(refresh, false) },
    stop: fn() { life.stop() },
    set_memo: fn(value) {
      if !state.value.busy {
        state.set({ ..state.value, carryInMemo: value, saved: false, })
      }
    },
    set_words: fn(value) {
      if !state.value.busy {
        state.set({ ..state.value, wordList: value, saved: false, })
      }
    },
    save: fn() {
      if !life.is_active() || state.value.busy {
        return
      }
      state.set({ ..state.value, busy: true, error: "", saved: false, })
      life.request(
        "memo",
        "PUT",
        "/memo",
        {
          "memo1": state.value.carryInMemo.to_json(),
          "memo2": state.value.wordList.to_json(),
        },
        fn(text) raise {
          @shared.checked_memo_response(text) |> ignore
          state.set({ ..state.value, busy: false, saved: true, })
        },
        failed,
      )
    },
  }
}
