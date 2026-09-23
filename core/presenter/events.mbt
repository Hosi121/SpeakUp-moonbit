///|
pub(all) struct EventsView {
  events : Array[@shared.EventOverviewDto]
  loaded : Bool
  error : String
}

///|
pub(all) struct EventsController {
  get_snapshot : () -> EventsView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  refresh : () -> Unit
}

///|
pub fn create_events(ports : AppPorts) -> EventsController {
  let state = store(EventsView::{ events: [], loaded: false, error: "", })
  let life = scope(ports)
  let refresh = fn() {
    life.request(
      "events",
      "GET",
      "/events/overview",
      Json::null(),
      fn(text) raise {
        state.set({
          events: @shared.checked_events(text),
          loaded: true,
          error: "",
        })
      },
      fn(_) {
        state.set({
          ..state.value,
          error: "イベントを取得できませんでした。",
        })
      },
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() { life.start(refresh, false) },
    stop: fn() { life.stop() },
    refresh,
  }
}

///|
pub(all) struct RosterRow {
  id : Int
  username : String
  status : String
}

///|
pub(all) struct EventCardView {
  value : @shared.EventOverviewDto
  rounds : Array[Bool]
  roster : Array[RosterRow]
  frozen : Bool
  busy : Bool
  error : String
  success : String
  confirm : Bool
}

///|
pub(all) struct EventCardController {
  get_snapshot : () -> EventCardView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  update : (@shared.EventOverviewDto) -> Unit
  set_round : (Int, Bool) -> Unit
  confirm : (Bool) -> Unit
  act : (String) -> Unit
}

///|
fn rounds(bit : Int) -> Array[Bool] {
  [1, 2, 4].map(fn(mask) { (bit & mask) != 0 })
}

///|
pub fn create_event_card(
  ports : AppPorts,
  value : @shared.EventOverviewDto,
  admin : Bool,
  owner : EventsController,
) -> EventCardController {
  let state = store(EventCardView::{
    value,
    rounds: rounds(value.participates_bit),
    roster: [],
    frozen: value.matching_state != "open",
    busy: false,
    error: "",
    success: "",
    confirm: false,
  })
  let life = scope(ports)
  let failed = fn(message) {
    state.set({ ..state.value, busy: false, error: message, })
  }
  let roster = fn() {
    life.request(
      "action",
      "GET",
      "/events/\{value.event.id}/roster",
      Json::null(),
      fn(text) raise {
        let rows = @shared.checked_roster(text).members.map(fn(participant) {
          let status : Array[String] = []
          for i in 0..<3 {
            let mask = 1 << i
            if (participant.participates_bit & mask) != 0 {
              let label = if (participant.matched_bit & mask) != 0 {
                "相手決定"
              } else if state.value.value.matching_state == "published" {
                "待機"
              } else {
                "登録"
              }
              status.push("R\{i + 1} \{label}")
            }
          }
          {
            id: participant.user.id,
            username: participant.user.username,
            status: if status.is_empty() {
              "参加なし"
            } else {
              status.join(" / ")
            },
          }
        })
        state.set({ ..state.value, roster: rows, busy: false, })
      },
      failed,
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() {
      life.start(fn() { state.set({ ..state.value, busy: false, }) }, false)
    },
    stop: fn() { life.stop() },
    update: fn(next) {
      if next.event.id != value.event.id {
        return
      }
      state.set({
        ..state.value,
        value: next,
        frozen: next.matching_state != "open",
        rounds: if next.participates_bit != state.value.value.participates_bit {
          rounds(next.participates_bit)
        } else {
          state.value.rounds
        },
      })
    },
    set_round: fn(index, checked) {
      if state.value.busy || state.value.frozen || index < 0 || index >= 3 {
        return
      }
      let rounds = state.value.rounds.copy()
      rounds[index] = checked
      state.set({ ..state.value, rounds, })
    },
    confirm: fn(confirm) {
      if !state.value.busy && admin {
        state.set({ ..state.value, confirm, })
      }
    },
    act: fn(action) {
      if !life.is_active() || state.value.busy {
        return
      }
      if action != "register" && action != "roster" && action != "match" {
        return
      }
      if action != "register" && !admin {
        return
      }
      if action == "register" && state.value.frozen {
        return
      }
      if action == "match" &&
        (
          !state.value.confirm ||
          state.value.value.matching_state == "published"
        ) {
        return
      }
      state.set({ ..state.value, busy: true, error: "", success: "", })
      if action == "roster" {
        roster()
        return
      }
      let mut bit = 0
      for i in 0..<3 {
        if state.value.rounds[i] {
          bit = bit | (1 << i)
        }
      }
      let body : Json = if action == "register" {
        { "participates_bit": bit.to_json() }
      } else {
        {}
      }
      life.request(
        "action",
        "POST",
        "/events/\{value.event.id}/\{action}",
        body,
        fn(_) {
          state.set({
            ..state.value,
            confirm: false,
            busy: action == "match",
            success: if action == "register" {
              "参加予定を保存しました。"
            } else {
              "通話相手を公開しました。"
            },
            value: if action == "match" {
              { ..state.value.value, matching_state: "published", }
            } else {
              state.value.value
            },
            frozen: action == "match",
          })
          (owner.refresh)()
          if action == "match" {
            roster()
          }
        },
        failed,
      )
    },
  }
}
