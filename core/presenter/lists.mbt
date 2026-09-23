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
  loading : Bool
  has_more : Bool
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
  load_more : () -> Unit
  retry : () -> Unit
}

///|
priv enum HistoryRequest {
  First
  Older(@shared.HistoryCursor)
}

///|
priv enum HistoryLoad {
  Idle
  Loading
  Ready(@shared.HistoryCursor?)
  Failed(HistoryRequest)
}

///|
pub fn create_history(ports : AppPorts) -> HistoryController {
  let state = store(HistoryView::{
    calls: [],
    loaded: false,
    loading: false,
    has_more: false,
    error: "",
    tab: "history",
  })
  let life = scope(ports)
  let phase : Ref[HistoryLoad] = Ref(Idle)
  let load = fn(request : HistoryRequest) {
    if !life.is_active() {
      return
    }
    phase.val = Loading
    state.set({ ..state.value, loading: true, error: "", })
    let path = match request {
      First => "/conversations/history/page"
      Older(cursor) => "/conversations/history/page/" + cursor.encode()
    }
    life.request(
      "history",
      "GET",
      path,
      Json::null(),
      fn(text) raise {
        let page = @shared.parse_history_page(text)
        let calls = match request {
          First => page.items
          Older(cursor) => {
            if page.items.get(0) is Some(first) {
              guard first.ended_at < cursor.ended_at ||
                (
                  first.ended_at == cursor.ended_at &&
                  first.id < cursor.id.value()
                ) else {
                fail("History did not advance")
              }
            }
            [..state.value.calls, ..page.items]
          }
        }
        phase.val = Ready(
          if page.next_cursor.is_empty() {
            None
          } else {
            Some(@shared.parse_history_cursor(page.next_cursor))
          },
        )
        state.set({
          ..state.value,
          calls,
          loaded: true,
          loading: false,
          has_more: !page.next_cursor.is_empty(),
          error: "",
        })
      },
      fn(message) {
        phase.val = Failed(request)
        state.set({ ..state.value, loading: false, error: message, })
      },
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() { life.start(fn() { load(First) }, false) },
    stop: fn() { life.stop() },
    set_tab: fn(tab) {
      if tab == "history" || tab == "friends" {
        state.set({ ..state.value, tab, })
      }
    },
    load_more: fn() {
      match phase.val {
        Ready(Some(cursor)) => load(Older(cursor))
        Idle | Loading | Ready(None) | Failed(_) => ()
      }
    },
    retry: fn() { if phase.val is Failed(request) { load(request) } },
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
