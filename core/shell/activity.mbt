///|
pub(all) struct ActivityLoaderPorts {
  load : ((@presenter.ActivityController) -> Unit, (String) -> Unit) -> Unit
  enabled : Bool
}

///|
/// Module loading is an effect; stale completions never start network work.
pub fn create_activity_loader(
  ports : ActivityLoaderPorts,
) -> @presenter.ActivityController {
  let state = Ref(@presenter.ActivityView::{
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
  let controller : Ref[@presenter.ActivityController?] = Ref(None)
  let listeners : Array[Listener] = []
  let next = Ref(0)
  let active = Ref(false)
  let generation = Ref(0)
  let unsubscribe = Ref(fn() { () })
  let notify = fn() { publish(listeners) }
  {
    get_snapshot: fn() { state.val },
    subscribe: fn(listener) { subscribe(listeners, next, listener) },
    start: fn() {
      if active.val {
        return
      }
      active.val = true
      generation.val += 1
      if !ports.enabled {
        return
      }
      let current = generation.val
      (ports.load)(
        fn(value) {
          if !active.val || current != generation.val {
            return
          }
          controller.val = Some(value)
          (value.set_open)(state.val.open)
          unsubscribe.val = (value.subscribe)(fn() {
            state.val = (value.get_snapshot)()
            notify()
          })
          state.val = (value.get_snapshot)()
          notify()
          (value.start)()
        },
        fn(error) {
          if !active.val || current != generation.val {
            return
          }
          state.val = { ..state.val, error, }
          notify()
        },
      )
    },
    stop: fn() {
      active.val = false
      generation.val += 1
      (unsubscribe.val)()
      unsubscribe.val = fn() { () }
      if controller.val is Some(value) {
        (value.stop)()
      }
      controller.val = None
    },
    refresh: fn() { if controller.val is Some(value) { (value.refresh)() } },
    set_open: fn(open) {
      state.val = { ..state.val, open, }
      notify()
      if controller.val is Some(value) {
        (value.set_open)(open)
      }
    },
    read: fn() { if controller.val is Some(value) { (value.read)() } },
  }
}
