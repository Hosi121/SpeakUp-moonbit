///|
pub(all) struct PageInput {
  conversation : String
  peer : String
  activity : @presenter.ActivityController
  failed : () -> Unit
}

///|
pub(all) struct PageRenderer {
  mount : (PageInput) -> () -> Unit
}

///|
pub(all) struct LocationInput {
  pathname : String
  conversation : String
  token : String
}

///|
pub(all) struct AppHost {
  location : () -> LocationInput
  on_location : (() -> Unit) -> () -> Unit
  navigate : (String, Bool) -> Unit
  load : (String, (PageRenderer) -> Unit, () -> Unit) -> Unit
  load_activity : ((@presenter.ActivityController) -> Unit, (String) -> Unit) -> Unit
  loading : () -> Unit
  not_found : () -> Unit
  failed : () -> Unit
}

///|
pub(all) struct AppController {
  start : () -> Unit
  stop : () -> Unit
}

///|
/// The renderer is a capability: route and module lifetime decisions stay here.
pub fn create_app(host : AppHost) -> AppController {
  let active = Ref(false)
  let generation = Ref(0)
  let key = Ref("")
  let token : Ref[String?] = Ref(None)
  let page = Ref(fn() { () })
  let unwatch = Ref(fn() { () })
  let activity = Ref(
    create_activity_loader({ enabled: false, load: host.load_activity, }),
  )
  let clear_page = fn() {
    let dispose = page.val
    page.val = fn() { () }
    dispose()
  }
  let refresh = fn() {
    if !active.val {
      return
    }
    let location = (host.location)()
    let target = route(location.pathname)
    if !target.redirect.is_empty() {
      (host.navigate)(target.redirect, true)
      return
    }
    let name = if !target.peer.is_empty() { "/message" } else { target.page }
    let supported = match name {
      "/login"
      | "/signup"
      | "/home"
      | "/settings"
      | "/events"
      | "/sessionlist"
      | "/miccheck"
      | "/session"
      | "/sessionrecord"
      | "/record"
      | "/memo"
      | "/stats"
      | "/conversation_history"
      | "/admin"
      | "/friendlist"
      | "/session_history_friendlist"
      | "/friendrequest"
      | "/sessionfeedback"
      | "/message" => true
      _ => false
    }
    let query = match name {
      "/session" | "/sessionrecord" | "/sessionfeedback" =>
        location.conversation
      _ => ""
    }
    let next = target.page + "?" + query
    if key.val == next && token.val == Some(location.token) {
      return
    }
    generation.val += 1
    let current = generation.val
    key.val = next
    clear_page()
    if token.val != Some(location.token) {
      (activity.val.stop)()
      token.val = Some(location.token)
      activity.val = create_activity_loader({
        enabled: !location.token.is_empty(),
        load: host.load_activity,
      })
      (activity.val.start)()
    }
    if !supported {
      (host.not_found)()
      return
    }
    let valid = fn() { active.val && generation.val == current }
    let failed = fn() {
      if !valid() {
        return
      }
      generation.val += 1
      clear_page()
      (host.failed)()
    }
    (host.loading)()
    let mounted = Ref(false)
    (host.load)(
      name,
      fn(renderer) {
        if !valid() || mounted.val {
          return
        }
        mounted.val = true
        let dispose = (renderer.mount)({
          conversation: query,
          peer: target.peer,
          activity: activity.val,
          failed,
        })
        if valid() {
          page.val = dispose
        } else {
          dispose()
        }
      },
      failed,
    )
  }
  {
    start: fn() {
      if active.val {
        return
      }
      active.val = true
      key.val = ""
      unwatch.val = (host.on_location)(refresh)
      refresh()
    },
    stop: fn() {
      if !active.val {
        return
      }
      active.val = false
      generation.val += 1
      (unwatch.val)()
      unwatch.val = fn() { () }
      clear_page()
      (activity.val.stop)()
      token.val = None
    },
  }
}
