///|
pub(all) struct CandidateView {
  person : @shared.FriendSummaryDto
  accepted : Bool
  known : Bool
  can_request : Bool
}

///|
pub(all) struct SocialView {
  social : @shared.SocialDto
  loaded : Bool
  candidates : Array[CandidateView]
  query : String
  busy : Bool
  error : String
}

///|
pub(all) struct SocialController {
  get_snapshot : () -> SocialView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  set_query : (String) -> Unit
  search : () -> Unit
  request : (Int) -> Unit
  accept : (Int) -> Unit
  reject : (Int) -> Unit
  cancel : (Int) -> Unit
  change : (Int, String) -> Unit
}

///|
fn candidates(
  people : Array[@shared.FriendSummaryDto],
  social : @shared.SocialDto,
  loaded : Bool,
  busy : Bool,
) -> Array[CandidateView] {
  people.map(fn(person) {
    let accepted = social.friends.any(fn(p) { p.id == person.id })
    let known = accepted ||
      social.incoming.any(fn(p) { p.id == person.id }) ||
      social.outgoing.any(fn(p) { p.id == person.id })
    { person, accepted, known, can_request: loaded && !busy && !known, }
  })
}

///|
fn social_publish(state : Store[SocialView], view : SocialView) -> Unit {
  state.set({
    ..view,
    candidates: candidates(
      view.candidates.map(fn(c) { c.person }),
      view.social,
      view.loaded,
      view.busy,
    ),
  })
}

///|
pub fn create_social(
  ports : AppPorts,
  with_candidates : Bool,
) -> SocialController {
  let state = store(SocialView::{
    social: empty_social(),
    loaded: false,
    candidates: [],
    query: "",
    busy: false,
    error: "",
  })
  let life = scope(ports)
  let failed = fn(message) {
    social_publish(state, { ..state.value, busy: false, error: message, })
  }
  let refresh = fn() {
    if life.work.contains("change") {
      return
    }
    life.request(
      "social",
      "GET",
      "/friends",
      Json::null(),
      fn(text) raise {
        social_publish(state, {
          ..state.value,
          social: @shared.checked_social(text),
          loaded: true,
        })
      },
      fn(_) {
        social_publish(state, {
          ..state.value,
          error: "フレンドを取得できませんでした。",
        })
      },
    )
  }
  let load_candidates = fn() {
    life.pair(
      "candidates",
      "/user/info",
      "/conversations/history",
      @shared.checked_profile_response,
      @shared.parse_conversations,
      fn(me, calls) {
        let people : Array[@shared.FriendSummaryDto] = []
        for call in calls {
          for person in call.participants {
            if person.id != me.id && !people.any(fn(p) { p.id == person.id }) {
              people.push(person)
            }
          }
        }
        social_publish(state, {
          ..state.value,
          candidates: candidates(
            people,
            state.value.social,
            state.value.loaded,
            state.value.busy,
          ),
        })
      },
      fn(_) {
        social_publish(state, {
          ..state.value,
          error: "通話相手を取得できませんでした。",
        })
      },
    )
  }
  let change = fn(id : Int, action : @friendship.Action) {
    if !life.is_active() || state.value.busy || id < 1 {
      return
    }
    let path = action.path()
    life.cancel("social")
    social_publish(state, { ..state.value, busy: true, error: "", })
    life.request(
      "change",
      "POST",
      "/friends/\{id}/\{path}",
      {},
      fn(text) raise {
        life.cancel("social")
        social_publish(state, {
          ..state.value,
          social: @shared.checked_social(text),
          loaded: true,
          busy: false,
        })
      },
      failed,
    )
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    start: fn() {
      if life.is_active() {
        return
      }
      life.start(
        fn() {
          social_publish(state, { ..state.value, busy: false, })
          refresh()
          if with_candidates {
            load_candidates()
          }
        },
        false,
      )
      life.watch(ports.on_activity, refresh)
    },
    stop: fn() { life.stop() },
    set_query: fn(query) { state.set({ ..state.value, query, }) },
    search: fn() {
      if !life.is_active() ||
        state.value.busy ||
        trim(state.value.query).is_empty() {
        return
      }
      life.cancel("candidates")
      social_publish(state, { ..state.value, busy: true, error: "", })
      let query = (ports.encode)(state.value.query)
      life.pair(
        "search",
        "/user/info",
        "/users/search?q=\{query}",
        @shared.checked_profile_response,
        @shared.checked_users_response,
        fn(me, users) {
          let people = users
            .filter(fn(p) { p.id != me.id })
            .map(fn(p) -> @shared.FriendSummaryDto {
              { id: p.id, username: p.username, avatar_url: p.avatarUrl, }
            })
          social_publish(state, {
            ..state.value,
            busy: false,
            candidates: candidates(
              people,
              state.value.social,
              state.value.loaded,
              false,
            ),
          })
        },
        fn(_) { failed("検索できませんでした。") },
      )
    },
    request: fn(id) { change(id, Request) },
    accept: fn(id) { change(id, Accept) },
    reject: fn(id) { change(id, Reject) },
    cancel: fn(id) { change(id, Cancel) },
    change: fn(id, value) {
      if @friendship.Action::parse(value) is Some(action) {
        change(id, action)
      }
    },
  }
}
