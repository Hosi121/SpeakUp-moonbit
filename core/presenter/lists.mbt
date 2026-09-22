///|
pub(all) struct HomeView {
  events : Array[@shared.Event]
  loading : Bool
  error : String
}

///|
pub(all) struct HomeController {
  get_snapshot : () -> HomeView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
}

///|
pub fn create_home(ports : AppPorts) -> HomeController {
  let state = store(HomeView::{ events: [], loading: true, error: "", })
  let life = scope(ports)
  let refresh = fn() {
    life.request(
      "home",
      "GET",
      "/events/overview",
      Json::null(),
      fn(text) raise {
        let events = @shared.checked_events(text).filter(fn(item) {
          item.participates_bit > 0 &&
          (ports.date)(item.event.event_end) > (ports.now)()
        })
        events.sort_by(fn(a, b) {
          a.event.event_start.compare(b.event.event_start)
        })
        state.set({
          events: events
          .get(0)
          .map(fn(item) { [@shared.map_event(item.event)] })
          .unwrap_or([]),
          loading: false,
          error: "",
        })
      },
      fn(_) {
        state.set({
          ..state.value,
          loading: false,
          error: "データの取得に失敗しました。",
        })
      },
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() { life.start(refresh, false) },
    stop: fn() { life.stop() },
  }
}

///|
pub(all) struct HistoryView {
  calls : Array[@shared.ConversationDto]
  loaded : Bool
  error : String
  tab : String
}

///|
pub(all) struct HistoryController {
  get_snapshot : () -> HistoryView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  set_tab : (String) -> Unit
}

///|
pub fn create_history(ports : AppPorts) -> HistoryController {
  let state = store(HistoryView::{
    calls: [],
    loaded: false,
    error: "",
    tab: "history",
  })
  let life = scope(ports)
  let refresh = fn() {
    life.request(
      "history",
      "GET",
      "/conversations/history",
      Json::null(),
      fn(text) raise {
        state.set({
          ..state.value,
          calls: @shared.parse_conversations(text),
          loaded: true,
          error: "",
        })
      },
      fn(message) { state.set({ ..state.value, error: message, }) },
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() { life.start(refresh, false) },
    stop: fn() { life.stop() },
    set_tab: fn(tab) {
      if tab == "history" || tab == "friends" {
        state.set({ ..state.value, tab, })
      }
    },
  }
}

///|
pub(all) struct StatsView {
  items : Array[@shared.StatsDto]
  error : String
}

///|
pub(all) struct StatsController {
  get_snapshot : () -> StatsView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
}

///|
pub fn create_stats(ports : AppPorts) -> StatsController {
  let state = store(StatsView::{ items: [], error: "", })
  let life = scope(ports)
  let refresh = fn() {
    life.request(
      "stats",
      "GET",
      "/stats",
      Json::null(),
      fn(text) raise {
        state.set({ items: [@shared.checked_stats(text)], error: "", })
      },
      fn(_) {
        state.set({
          ..state.value,
          error: "参加データを取得できませんでした。",
        })
      },
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() { life.start(refresh, true) },
    stop: fn() { life.stop() },
  }
}
