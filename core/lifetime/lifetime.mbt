///|
/// One lifetime, never reopened. A new operation gets a new lifetime.
pub struct Lifetime {
  priv mut state : State
  priv mut next : Int
}

///|
priv enum State {
  Open(Map[Int, () -> Unit])
  Closed
}

///|
/// An idempotent release which removes itself from its parent.
pub struct Release {
  priv run : () -> Unit
}

///|
pub fn Lifetime::Lifetime() -> Lifetime {
  { state: Open(Map([])), next: 0, }
}

///|
pub fn Lifetime::is_open(self : Self) -> Bool {
  self.state is Open(_)
}

///|
pub fn Release::close(self : Self) -> Unit {
  (self.run)()
}

///|
/// Adopt cleanup immediately, even if acquisition completed after close.
/// Cleanup must not throw. Releases run in reverse registration order.
pub fn Lifetime::own(self : Self, cleanup : () -> Unit) -> Release {
  match self.state {
    Closed => {
      cleanup()
      { run: fn() {  }, }
    }
    Open(releases) => {
      self.next += 1
      while releases.contains(self.next) {
        self.next += 1
      }
      let id = self.next
      releases[id] = cleanup
      {
        run: fn() {
          if releases.get(id) is Some(cleanup) {
            releases.remove(id)
            cleanup()
          }
        },
      }
    }
  }
}

///|
pub fn Lifetime::close(self : Self) -> Unit {
  guard self.state is Open(releases) else { return }
  self.state = Closed
  let ids = releases.keys().to_array()
  ids.sort()
  for i = ids.length() - 1; i >= 0; i = i - 1 {
    if releases.get(ids[i]) is Some(cleanup) {
      releases.remove(ids[i])
      cleanup()
    }
  }
}

///|
pub fn Lifetime::child(self : Self) -> Lifetime {
  let child = Lifetime()
  let parent_release = self.own(fn() { child.close() })
  ignore(child.own(fn() { parent_release.close() }))
  child
}
