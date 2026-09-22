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
fn noop() -> Unit {
  ()
}

///|
priv struct Work {
  id : Int
  mut cancel : () -> Unit
}

///|
priv struct Scope {
  ports : AppPorts
  mut active : Bool
  mut sequence : Int
  work : Map[String, Work]
  mut unwatch : () -> Unit
}

///|
fn scope(ports : AppPorts) -> Scope {
  { ports, active: false, sequence: 0, work: Map([]), unwatch: noop, }
}

///|
fn Scope::cancel(self : Self, key : String) -> Unit {
  if self.work.get(key) is Some(work) {
    self.work.remove(key)
    (work.cancel)()
  }
}

///|
fn Scope::stop(self : Self) -> Unit {
  self.active = false
  (self.unwatch)()
  self.unwatch = noop
  for key in self.work.keys().to_array() {
    self.cancel(key)
  }
}

///|
fn Scope::start(self : Self, refresh : () -> Unit, activity : Bool) -> Unit {
  if self.active {
    return
  }
  self.active = true
  if activity {
    self.unwatch = (self.ports.on_activity)(refresh)
  }
  refresh()
}

///|
fn Scope::run(
  self : Self,
  key : String,
  launch : ((Double, String, Bool) -> Unit) -> () -> Unit,
  done : (String) -> Unit raise,
  failed : (String) -> Unit,
) -> Unit {
  if !self.active {
    return
  }
  self.cancel(key)
  self.sequence += 1
  let id = self.sequence
  let pending : Work = { id, cancel: noop, }
  self.work[key] = pending
  let cancel = launch(fn(status, text, network_error) {
    guard self.active &&
      self.work.get(key).map(fn(w) { w.id == id }).unwrap_or(false) else {
      return
    }
    self.work.remove(key)
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
  pending.cancel = cancel
  if !self.work.get(key).map(fn(w) { w.id == id }).unwrap_or(false) {
    cancel()
  }
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
  if !self.active {
    return
  }
  self.cancel(key)
  self.sequence += 1
  let id = self.sequence
  let first_key = key + "/first"
  let second_key = key + "/second"
  self.work[key] = {
    id,
    cancel: fn() {
      self.cancel(first_key)
      self.cancel(second_key)
    },
  }
  let first : Ref[A?] = Ref(None)
  let second : Ref[B?] = Ref(None)
  let valid = fn() {
    self.active && self.work.get(key).map(fn(w) { w.id == id }).unwrap_or(false)
  }
  let reject = fn(message) {
    if valid() {
      self.cancel(key)
      failed(message)
    }
  }
  let ready = fn() {
    if !valid() {
      return
    }
    if first.val is Some(a) && second.val is Some(b) {
      self.cancel(key)
      done(a, b) catch {
        _ => failed("データを取得・保存できませんでした")
      }
    }
  }
  self.request(
    first_key,
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
    self.request(
      second_key,
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
