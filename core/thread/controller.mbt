///|
/// All fields are immutable snapshots. Renderers must not mutate the arrays.
pub(all) struct MessageView {
  id : Int
  body : String
  time : String
  own : Bool
  read : Bool
}

///|
pub(all) struct ThreadView {
  valid : Bool
  loaded : Bool
  peer_name : String
  peer_avatar : String
  messages : Array[MessageView]
  draft : String
  error : String
  sending : Bool
  loading_older : Bool
  has_older : Bool
  can_send : Bool
}

///|
/// Each I/O operation is a primitive and returns its cancellation/unsubscribe
/// function. This also permits synchronous, deterministic ports in native tests.
pub(all) struct ThreadPorts {
  request : (String, String, String, (Double, String, Bool) -> Unit) -> () -> Unit
  random_id : () -> String
  format_time : (String) -> String
  is_visible : () -> Bool
  on_visibility : ((Bool) -> Unit) -> () -> Unit
  on_activity : (() -> Unit) -> () -> Unit
}

///|
pub(all) struct ThreadController {
  get_snapshot : () -> ThreadView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  refresh : () -> Unit
  set_draft : (String) -> Unit
  send : () -> Unit
  load_older : () -> Unit
}

///|
priv enum Operation {
  Refresh
  Older
  Read(Int)
  Send(String)
}

///|
priv struct Pending {
  operation : Operation
  mut cancel : () -> Unit
}

///|
priv struct State {
  peer : Int
  ports : ThreadPorts
  mut view : ThreadView
  mut thread : @shared.ThreadDto?
  mut active : Bool
  mut visible : Bool
  mut next_id : Int
  mut latest_refresh : Int
  mut metadata_revision : Int
  mut read_busy : Bool
  mut read_through : Int
  mut retry : (String, String)?
  requests : Map[Int, Pending]
  listeners : Map[Int, () -> Unit]
  mut next_listener : Int
  mut unwatch_visibility : () -> Unit
  mut unwatch_activity : () -> Unit
}

///|
fn noop() -> Unit {
  ()
}

///|
/// Preserve ECMAScript TrimString's WhiteSpace + LineTerminator set. MoonBit's
/// default trim only removes ASCII space, tab, CR and LF.
fn sendable(draft : String) -> Bool {
  draft.length() <= 2000 &&
  !draft
  .trim(
    chars="\u{0009}\u{000A}\u{000B}\u{000C}\u{000D}\u{0020}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}",
  )
  .is_empty()
}

///|
fn State::publish(self : Self, view : ThreadView) -> Unit {
  self.view = view
  // A listener may unsubscribe while being notified.
  for listener in self.listeners.values().to_array() {
    listener()
  }
}

///|
fn State::merge(
  self : Self,
  next : @shared.ThreadDto,
  older : Bool,
  id : Int,
) -> Unit {
  let messages : Map[Int, @shared.MessageDto] = Map([])
  if self.thread is Some(previous) {
    for message in previous.messages {
      messages[message.id] = message
    }
  }
  for message in next.messages {
    let read_at = if !message.read_at.is_empty() {
      message.read_at
    } else {
      match messages.get(message.id) {
        Some(previous) => previous.read_at
        None => ""
      }
    }
    messages[message.id] = { ..message, read_at, }
  }
  let sorted = messages.values().to_array()
  sorted.sort_by(fn(a, b) { a.id.compare(b.id) })
  let previous = self.thread
  let has_older = match previous {
    Some(previous) if !older => previous.has_older
    _ => next.has_older
  }
  let peer = match previous {
    Some(previous) if id < self.metadata_revision => previous.peer
    _ => {
      self.metadata_revision = id
      next.peer
    }
  }
  self.thread = Some({ peer, messages: sorted, has_older, })
  let rows = sorted.map(fn(message) {
    MessageView::{
      id: message.id,
      body: message.body,
      time: (self.ports.format_time)(message.created_at),
      own: message.sender_id != self.peer,
      read: !message.read_at.is_empty(),
    }
  })
  self.publish({
    ..self.view,
    loaded: true,
    peer_name: peer.username,
    peer_avatar: peer.avatar_url,
    messages: rows,
    has_older,
  })
}

///|
fn response_error(status : Double, text : String) -> String {
  let value = @json.parse(text) catch {
    _ =>
      return if text.is_empty() {
        "通信に失敗しました（\{status.to_int()}）"
      } else {
        text
      }
  }
  if value is String(message) && !message.is_empty() {
    return message
  }
  if value is Object(fields) {
    for key in ["message", "error", "detail"] {
      if fields.get(key) is Some(String(message)) && !message.is_empty() {
        return message
      }
    }
  }
  "通信に失敗しました（\{status.to_int()}）"
}

///|
fn State::request(
  self : Self,
  operation : Operation,
  verb : String,
  path : String,
  body : String,
) -> Unit {
  if !self.active {
    return
  }
  self.next_id += 1
  let id = self.next_id
  if operation is Refresh {
    let old = self.latest_refresh
    self.latest_refresh = id
    if self.requests.get(old) is Some(pending) {
      self.requests.remove(old)
      (pending.cancel)()
    }
  }
  let pending = Pending::{ operation, cancel: noop, }
  self.requests[id] = pending
  let cancel = (self.ports.request)(verb, path, body, fn(status, text, failed) {
    // Cancellation can race with response completion, and a port may complete
    // twice. Membership is the authority, independent of renderer lifetimes.
    if !self.active || !self.requests.contains(id) {
      return
    }
    self.requests.remove(id)
    self.complete(id, pending.operation, status, text, failed)
  })
  pending.cancel = cancel
  if !self.active {
    cancel()
  }
}

///|
fn State::complete(
  self : Self,
  id : Int,
  operation : Operation,
  status : Double,
  text : String,
  failed : Bool,
) -> Unit {
  let result : Result[@shared.ThreadDto, String] = if failed {
    Err("サーバーに接続できませんでした")
  } else if status < 200 || status >= 300 {
    Err(response_error(status, text))
  } else {
    let parsed = @shared.checked_thread(text) catch {
      _ => {
        self.finish_error(
          operation, "データを取得・保存できませんでした",
        )
        return
      }
    }
    if parsed.peer.id != self.peer ||
      parsed.messages.any(fn(message) {
        message.sender_id != self.peer && message.recipient_id != self.peer
      }) {
      Err("データを取得・保存できませんでした")
    } else {
      Ok(parsed)
    }
  }
  match result {
    Err(error) => self.finish_error(operation, error)
    Ok(thread) => {
      let older = operation is Older
      match operation {
        Refresh => ()
        Older => self.view = { ..self.view, loading_older: false, }
        Read(through) => {
          self.read_busy = false
          if through > self.read_through {
            self.read_through = through
          }
        }
        Send(body) => {
          self.retry = None
          let draft = if self.view.draft == body { "" } else { self.view.draft }
          self.view = {
            ..self.view,
            sending: false,
            draft,
            can_send: sendable(draft),
          }
        }
      }
      self.merge(thread, older, id)
      self.acknowledge()
    }
  }
}

///|
fn State::finish_error(
  self : Self,
  operation : Operation,
  error : String,
) -> Unit {
  let error = match operation {
    Older => "過去のメッセージを取得できませんでした。"
    _ => error
  }
  let mut view = { ..self.view, error, }
  match operation {
    Older => view = { ..view, loading_older: false, }
    Read(_) => self.read_busy = false
    Send(_) =>
      view = { ..view, sending: false, can_send: sendable(view.draft), }
    Refresh => ()
  }
  self.publish(view)
}

///|
fn State::acknowledge(self : Self) -> Unit {
  if !self.active || !self.visible || self.read_busy {
    return
  }
  guard self.thread is Some(thread) else { return }
  let mut through = self.read_through
  for message in thread.messages {
    if message.sender_id == self.peer && message.read_at.is_empty() {
      if message.id > through {
        through = message.id
      }
    }
  }
  if through <= self.read_through {
    return
  }
  self.read_busy = true
  let body : Json = { "through_id": through.to_json() }
  self.request(
    Read(through),
    "PUT",
    "/messages/\{self.peer}/read",
    body.stringify(),
  )
}

///|
fn State::refresh(self : Self) -> Unit {
  self.request(Refresh, "GET", "/messages/\{self.peer}", "")
}

///|
fn State::start(self : Self) -> Unit {
  if self.active || !self.view.valid {
    return
  }
  self.active = true
  self.visible = (self.ports.is_visible)()
  self.unwatch_visibility = (self.ports.on_visibility)(fn(visible) {
    if self.active {
      self.visible = visible
      if visible {
        self.acknowledge()
      }
    }
  })
  self.unwatch_activity = (self.ports.on_activity)(fn() { self.refresh() })
  self.refresh()
}

///|
fn State::stop(self : Self) -> Unit {
  self.active = false
  let requests = self.requests.values().to_array()
  self.requests.clear()
  for pending in requests {
    (pending.cancel)()
  }
  (self.unwatch_visibility)()
  (self.unwatch_activity)()
  self.unwatch_visibility = noop
  self.unwatch_activity = noop
  self.read_busy = false
  self.publish({
    ..self.view,
    sending: false,
    loading_older: false,
    can_send: sendable(self.view.draft),
  })
}

///|
fn State::send(self : Self) -> Unit {
  if !self.active || !self.view.loaded || !self.view.can_send {
    return
  }
  let body = self.view.draft
  let key = match self.retry {
    Some((previous, key)) if previous == body => key
    _ => (self.ports.random_id)()
  }
  self.retry = Some((body, key))
  self.publish({ ..self.view, sending: true, can_send: false, error: "", })
  let payload : Json = { "body": body.to_json(), "request_id": key.to_json() }
  self.request(
    Send(body),
    "POST",
    "/messages/\{self.peer}",
    payload.stringify(),
  )
}

///|
fn State::older(self : Self) -> Unit {
  if !self.active || self.view.loading_older || !self.view.has_older {
    return
  }
  guard self.view.messages.get(0) is Some(first) else { return }
  self.publish({ ..self.view, loading_older: true, error: "", })
  self.request(Older, "GET", "/messages/\{self.peer}/before/\{first.id}", "")
}

///|
pub fn create_controller(
  peer : Double,
  ports : ThreadPorts,
) -> ThreadController {
  let valid = peer >= 1 &&
    peer <= 2147483647 &&
    peer.to_int().to_double() == peer
  let state = State::{
    peer: if valid {
      peer.to_int()
    } else {
      0
    },
    ports,
    view: {
      valid,
      loaded: false,
      peer_name: "",
      peer_avatar: "",
      messages: [],
      draft: "",
      error: "",
      sending: false,
      loading_older: false,
      has_older: false,
      can_send: false,
    },
    thread: None,
    active: false,
    visible: false,
    next_id: 0,
    latest_refresh: 0,
    metadata_revision: 0,
    read_busy: false,
    read_through: 0,
    retry: None,
    requests: {},
    listeners: {},
    next_listener: 0,
    unwatch_visibility: noop,
    unwatch_activity: noop,
  }
  {
    get_snapshot: fn() { state.view },
    subscribe: fn(listener) {
      state.next_listener += 1
      let id = state.next_listener
      state.listeners[id] = listener
      fn() { state.listeners.remove(id) }
    },
    start: fn() { state.start() },
    stop: fn() { state.stop() },
    refresh: fn() { state.refresh() },
    send: fn() { state.send() },
    load_older: fn() { state.older() },
    set_draft: fn(draft) {
      if !state.active || state.view.sending || draft == state.view.draft {
        return
      }
      state.publish({ ..state.view, draft, can_send: sendable(draft), })
    },
  }
}
