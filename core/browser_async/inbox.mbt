///|
/// Bounded callback ingress with one async reader. The queue and wakeup slot
/// belong to the same lifetime; callbacks cannot feed a replacement reader.
pub struct Inbox[T] {
  priv life : @lifetime.Lifetime
  priv values : @deque.Deque[T]
  priv limit : Int
  priv mut notify : ((Result[Unit, PortError]) -> Unit)?
}

///|
pub fn[T] Inbox::Inbox(life : @lifetime.Lifetime, limit~ : Int) -> Inbox[T] {
  let inbox = { life, values: @deque.Deque([]), limit, notify: None, }
  ignore(life.own(fn() { inbox.values.clear() }))
  inbox
}

///|
pub fn[T] Inbox::offer(self : Self[T], value : T) -> Bool {
  if !self.life.is_open() || self.values.length() >= self.limit {
    return false
  }
  self.values.push_back(value)
  if self.notify is Some(notify) {
    self.notify = None
    notify(Ok(()))
  }
  true
}

///|
pub async fn[T] Inbox::next(self : Self[T]) -> T {
  check(self.life)
  while self.values.is_empty() {
    wait(self.life, fn(notify) {
      self.notify = Some(notify)
      fn() { self.notify = None }
    })
  }
  self.values.pop_front().unwrap()
}
