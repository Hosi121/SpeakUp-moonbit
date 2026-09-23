///|
pub(all) struct ReflectionView {
  id : Int
  conversation : Array[@shared.ConversationDto]
  satisfaction : String
  comment : String
  learned : String
  busy : Bool
  error : String
  saved : Bool
  complete : Bool
}

///|
pub(all) struct ReflectionController {
  get_snapshot : () -> ReflectionView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  set_satisfaction : (String) -> Unit
  set_comment : (String) -> Unit
  set_learned : (String) -> Unit
  save : () -> Unit
}

///|
pub fn create_reflection(
  ports : AppPorts,
  raw : String,
) -> ReflectionController {
  let id = identifier((ports.number)(raw))
  let state = store(ReflectionView::{
    id,
    conversation: [],
    satisfaction: "50",
    comment: "",
    learned: "",
    busy: true,
    error: "",
    saved: false,
    complete: false,
  })
  let life = scope(ports)
  let failed = fn(message) {
    state.set({ ..state.value, busy: false, error: message, })
  }
  let refresh = fn() {
    if id == 0 {
      return
    }
    state.set({ ..state.value, busy: true, })
    life.pair(
      "record",
      "/conversations/\{id}",
      "/conversations/\{id}/reflection",
      @shared.parse_call,
      @shared.parse_reflection,
      fn(call, reflection) raise {
        guard call.model.id().value() == id else { fail("Wrong conversation") }
        state.set({
          ..state.value,
          conversation: [call.dto()],
          complete: call.model.phase() is Completed(_, _),
          satisfaction: reflection.satisfaction.to_string(),
          comment: reflection.comment,
          learned: reflection.learned_expressions,
          saved: reflection.saved,
          busy: false,
          error: "",
        })
      },
      failed,
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() { life.start(refresh, false) },
    stop: fn() { life.stop() },
    set_satisfaction: fn(value) {
      if !state.value.busy && state.value.complete {
        state.set({ ..state.value, satisfaction: value, saved: false, })
      }
    },
    set_comment: fn(value) {
      if !state.value.busy && state.value.complete {
        state.set({ ..state.value, comment: value, saved: false, })
      }
    },
    set_learned: fn(value) {
      if !state.value.busy && state.value.complete {
        state.set({ ..state.value, learned: value, saved: false, })
      }
    },
    save: fn() {
      if !life.is_active() || state.value.busy || !state.value.complete {
        return
      }
      let rating = (ports.number)(state.value.satisfaction)
      if trim(state.value.satisfaction).is_empty() ||
        !(rating >= 0 && rating <= 100) ||
        rating != rating.to_int().to_double() {
        failed("満足度は 0〜100 の整数で入力してください")
        return
      }
      state.set({ ..state.value, busy: true, error: "", saved: false, })
      life.request(
        "record",
        "PUT",
        "/conversations/\{id}/reflection",
        {
          "satisfaction": rating.to_int().to_json(),
          "comment": state.value.comment.to_json(),
          "learned_expressions": state.value.learned.to_json(),
        },
        fn(text) raise {
          @shared.parse_reflection(text) |> ignore
          state.set({ ..state.value, busy: false, saved: true, })
        },
        failed,
      )
    },
  }
}

///|
pub(all) struct LearningView {
  id : Int
  answers : Array[Int]
  feedback : String
  feedback_current : Bool
  busy : Bool
  error : String
  saved : Bool
  can_generate : Bool
}

///|
pub(all) struct LearningController {
  get_snapshot : () -> LearningView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  set_saved : (Bool) -> Unit
  answer : (Int, Int) -> Unit
  save : () -> Unit
  generate : () -> Unit
}

///|
pub fn create_learning(
  ports : AppPorts,
  raw : String,
  saved : Bool,
) -> LearningController {
  let id = identifier((ports.number)(raw))
  let state = store(LearningView::{
    id,
    answers: [1, 1, 1, 1, 1, 1],
    feedback: "",
    feedback_current: false,
    busy: true,
    error: "",
    saved: false,
    can_generate: false,
  })
  let reflection_saved = Ref(saved)
  let life = scope(ports)
  let update = fn(view : LearningView) {
    state.set({
      ..view,
      can_generate: reflection_saved.val && !view.busy && !view.feedback_current,
    })
  }
  let failed = fn(message) {
    update({ ..state.value, busy: false, error: message, })
  }
  let receive = fn(text : String) raise {
    let learning = @shared.checked_learning(text)
    update({
      ..state.value,
      answers: if learning.answers.is_empty() {
        state.value.answers
      } else {
        learning.answers
      },
      saved: !learning.answers.is_empty(),
      feedback: learning.feedback,
      feedback_current: learning.feedback_current,
      busy: false,
      error: "",
    })
  }
  let refresh = fn() {
    if id == 0 {
      return
    }
    update({ ..state.value, busy: true, })
    life.request(
      "learning",
      "GET",
      "/conversations/\{id}/learning",
      Json::null(),
      receive,
      fn(_) { failed("振り返りを取得できませんでした。") },
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() { life.start(refresh, false) },
    stop: fn() { life.stop() },
    set_saved: fn(saved) {
      if saved == reflection_saved.val {
        return
      }
      reflection_saved.val = saved
      update(state.value)
      if life.is_active() {
        refresh()
      }
    },
    answer: fn(index, value) {
      if state.value.busy || index < 0 || index >= 6 || value < 0 || value > 2 {
        return
      }
      let answers = state.value.answers.copy()
      answers[index] = value
      update({ ..state.value, answers, saved: false, })
    },
    save: fn() {
      if !life.is_active() || id == 0 || state.value.busy {
        return
      }
      update({ ..state.value, busy: true, error: "", saved: false, })
      life.request(
        "learning",
        "PUT",
        "/conversations/\{id}/survey",
        { "answers": state.value.answers.to_json() },
        receive,
        failed,
      )
    },
    generate: fn() {
      if !life.is_active() || !state.value.can_generate {
        return
      }
      update({ ..state.value, busy: true, error: "", })
      life.request(
        "learning",
        "POST",
        "/conversations/\{id}/feedback",
        {},
        receive,
        failed,
      )
    },
  }
}
