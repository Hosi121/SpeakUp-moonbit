///|
pub(all) struct CallRow {
  call : @shared.ConversationDto
  partner : String
  can_join : Bool
  active : Bool
  path : String
}

///|
pub(all) struct CallsView {
  calls : Array[CallRow]
  query : String
  users : Array[@shared.User]
  busy : Bool
  refreshing : Bool
  loaded : Bool
  can_search : Bool
  error : String
}

///|
pub(all) struct CallsController {
  get_snapshot : () -> CallsView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  refresh : () -> Unit
  set_query : (String) -> Unit
  search : () -> Unit
  invite : (Int) -> Unit
}

///|
pub fn create_calls(ports : AppPorts) -> CallsController {
  let state = store(CallsView::{
    calls: [],
    query: "",
    users: [],
    busy: false,
    refreshing: false,
    loaded: false,
    can_search: false,
    error: "",
  })
  let life = scope(ports)
  let me = Ref(empty_user())
  let keys : Map[Int, String] = Map([])
  let update = fn(view : CallsView) {
    state.set({
      ..view,
      can_search: !view.busy && me.val.id > 0 && !trim(view.query).is_empty(),
    })
  }
  let failed = fn(message) {
    update({ ..state.value, busy: false, refreshing: false, error: message, })
  }
  let refresh = fn() {
    update({ ..state.value, refreshing: true, })
    life.pair(
      "calls",
      "/user/info",
      "/conversations",
      @shared.checked_profile_response,
      @shared.parse_calls,
      fn(profile, values) raise {
        let calls = values.map(fn(call) raise {
          let clock = call.clock((ports.now)())
          {
            call: call.dto(),
            partner: call.partner(profile.id).username,
            can_join: clock.can_join,
            active: call.model.phase() is Active(_),
            path: "/session?conversation=\{call.model.id().value()}",
          }
        })
        me.val = profile
        update({
          ..state.value,
          calls,
          refreshing: false,
          loaded: true,
          error: "",
        })
      },
      fn(message) {
        update({ ..state.value, refreshing: false, error: message, })
      },
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() {
      if !life.is_active() {
        update({ ..state.value, busy: false, })
        life.start(refresh, true)
      }
    },
    stop: fn() { life.stop() },
    refresh,
    set_query: fn(query) { update({ ..state.value, query, }) },
    search: fn() {
      if !life.is_active() || !state.value.can_search {
        return
      }
      update({ ..state.value, busy: true, error: "", })
      let query = (ports.encode)(trim(state.value.query))
      life.request(
        "search",
        "GET",
        "/users/search?q=\{query}",
        Json::null(),
        fn(text) raise {
          update({
            ..state.value,
            users: @shared.checked_users_response(text).filter(fn(user) {
              user.id != me.val.id
            }),
            busy: false,
          })
        },
        failed,
      )
    },
    invite: fn(id) {
      if !life.is_active() || state.value.busy || id <= 0 || id == me.val.id {
        return
      }
      let key = match keys.get(id) {
        Some(key) => key
        None => {
          let key = (ports.random_id)()
          keys[id] = key
          key
        }
      }
      update({ ..state.value, busy: true, error: "", })
      life.request(
        "invite",
        "POST",
        "/conversations/direct",
        { "target_user_id": id.to_json(), "request_id": key.to_json() },
        fn(text) raise {
          let call = @shared.parse_conversation(text)
          update({ ..state.value, busy: false, })
          (ports.navigate)("/session?conversation=\{call.id}", false)
        },
        failed,
      )
    },
  }
}
