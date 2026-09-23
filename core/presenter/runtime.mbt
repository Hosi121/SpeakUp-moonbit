///|
pub(all) struct AppPorts {
  request : (String, String, String, (Double, String, Bool) -> Unit) -> () -> Unit
  now : () -> Double
  number : (String) -> Double
  date : (String) -> Double
  iso : (String) -> String
  encode : (String) -> String
  random_id : () -> String
  navigate : (String, Bool) -> Unit
  token : () -> String
  store_token : (String) -> Unit
  timeout : (Double, () -> Unit) -> () -> Unit
  on_activity : (() -> Unit) -> () -> Unit
}

///|
priv struct Store[T] {
  mut value : T
  listeners : Map[Int, () -> Unit]
  mut next : Int
}

///|
fn[T] store(value : T) -> Store[T] {
  { value, listeners: Map([]), next: 0, }
}

///|
fn[T] Store::set(self : Store[T], value : T) -> Unit {
  self.value = value
  for listener in self.listeners.values().to_array() {
    listener()
  }
}

///|
fn[T] Store::subscribe(self : Store[T], listener : () -> Unit) -> () -> Unit {
  self.next += 1
  let id = self.next
  self.listeners[id] = listener
  fn() { self.listeners.remove(id) }
}

///|
#cfg(target="js")
fn noop() -> Unit {
  ()
}

///|
priv struct Scope {
  ports : AppPorts
  mut current : @lifetime.Lifetime?
  work : Map[String, @lifetime.Lifetime]
}

///|
fn scope(ports : AppPorts) -> Scope {
  { ports, current: None, work: Map([]), }
}

///|
fn Scope::is_active(self : Self) -> Bool {
  self.current.map(fn(life) { life.is_open() }).unwrap_or(false)
}

///|
fn Scope::activate(self : Self) -> Unit {
  if !self.is_active() {
    self.current = Some(@lifetime.Lifetime())
  }
}

///|
fn Scope::watch(
  self : Self,
  register : (() -> Unit) -> () -> Unit,
  listener : () -> Unit,
) -> Unit {
  guard self.current is Some(owner) && owner.is_open() else { return }
  let cancel = register(fn() { if owner.is_open() { listener() } })
  ignore(owner.own(cancel))
}

///|
fn Scope::begin(self : Self, key : String) -> @lifetime.Lifetime? {
  guard self.current is Some(parent) && parent.is_open() else { return None }
  self.cancel(key)
  // Cancelling an operation can synchronously stop its parent.
  guard parent.is_open() && !self.work.contains(key) else { return None }
  let pending = parent.child()
  self.work[key] = pending
  Some(pending)
}

///|
fn Scope::cancel(self : Self, key : String) -> Unit {
  if self.work.get(key) is Some(work) {
    self.work.remove(key)
    work.close()
  }
}

///|
fn Scope::stop(self : Self) -> Unit {
  let previous = self.current
  self.current = None
  self.work.clear()
  if previous is Some(life) {
    life.close()
  }
}

///|
fn Scope::start(self : Self, refresh : () -> Unit, activity : Bool) -> Unit {
  if self.is_active() {
    return
  }
  self.activate()
  guard self.current is Some(owner) else { return }
  if activity {
    self.watch(self.ports.on_activity, refresh)
  }
  if owner.is_open() {
    refresh()
  }
}

///|
fn Scope::run(
  self : Self,
  key : String,
  launch : ((Double, String, Bool) -> Unit) -> () -> Unit,
  done : (String) -> Unit raise,
  failed : (String) -> Unit,
) -> Unit {
  guard self.current is Some(owner) else { return }
  guard self.begin(key) is Some(pending) else { return }
  let cancel = launch(fn(status, text, network_error) {
    guard pending.is_open() else { return }
    self.work.remove(key)
    pending.close()
    guard owner.is_open() else { return }
    if network_error {
      failed("サーバーに接続できませんでした")
      return
    }
    if status < 200 || status >= 300 {
      failed(http_error(status, text))
      return
    }
    done(text) catch {
      _ => failed("データを取得・保存できませんでした")
    }
  })
  ignore(pending.own(cancel))
}

///|
fn Scope::request(
  self : Self,
  key : String,
  verb : String,
  path : String,
  body : Json,
  done : (String) -> Unit raise,
  failed : (String) -> Unit,
) -> Unit {
  self.run(
    key,
    fn(cb) {
      (self.ports.request)(
        verb,
        path,
        if body is Null {
          ""
        } else {
          body.stringify()
        },
        cb,
      )
    },
    done,
    failed,
  )
}

///|
/// Two independent reads start together and publish one coherent result. The
/// parent owns both cancellations, including failure before the other completes.
fn[A, B] Scope::pair(
  self : Self,
  key : String,
  first_path : String,
  second_path : String,
  first_decode : (String) -> A raise,
  second_decode : (String) -> B raise,
  done : (A, B) -> Unit raise,
  failed : (String) -> Unit,
) -> Unit {
  guard self.current is Some(owner) else { return }
  guard self.begin(key) is Some(pending) else { return }
  let pair : Scope = {
    ports: self.ports,
    current: Some(pending.child()),
    work: Map([]),
  }
  let first : Ref[A?] = Ref(None)
  let second : Ref[B?] = Ref(None)
  let valid = fn() { pending.is_open() }
  let reject = fn(message) {
    if valid() {
      self.cancel(key)
      if owner.is_open() {
        failed(message)
      }
    }
  }
  let ready = fn() {
    if !valid() {
      return
    }
    if first.val is Some(a) && second.val is Some(b) {
      self.cancel(key)
      guard owner.is_open() else { return }
      done(a, b) catch {
        _ => failed("データを取得・保存できませんでした")
      }
    }
  }
  pair.request(
    "first",
    "GET",
    first_path,
    Json::null(),
    fn(text) raise {
      first.val = Some(first_decode(text))
      ready()
    },
    reject,
  )
  if valid() {
    pair.request(
      "second",
      "GET",
      second_path,
      Json::null(),
      fn(text) raise {
        second.val = Some(second_decode(text))
        ready()
      },
      reject,
    )
  }
}

///|
pub fn http_error(status : Double, text : String) -> String {
  let value = @json.parse(text) catch { _ => text.to_json() }
  match value {
    String(message) if !message.is_empty() => message
    { "message": String(message), .. } if !message.is_empty() => message
    { "error": String(message), .. } if !message.is_empty() => message
    { "detail": String(message), .. } if !message.is_empty() => message
    _ => "通信に失敗しました（\{status.to_int()}）"
  }
}

///|
fn trim(value : String) -> String {
  value
  .trim(
    chars="\u{0009}\u{000A}\u{000B}\u{000C}\u{000D}\u{0020}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}",
  )
  .to_owned()
}

///|
fn identifier(value : Double) -> Int {
  if value >= 1 && value <= 2147483647 && value == value.to_int().to_double() {
    value.to_int()
  } else {
    0
  }
}

///|
fn empty_user() -> @shared.UserProfile {
  {
    id: 0,
    username: "",
    email: "",
    avatarUrl: "",
    role: "",
    createdAt: "",
    updatedAt: "",
  }
}

///|
fn empty_social() -> @shared.SocialDto {
  { friends: [], incoming: [], outgoing: [], }
}
