///|
priv struct Listener {
  id : Int
  notify : () -> Unit
}

///|
/// A shell view has only a few subscribers. An array avoids pulling the hash
/// table runtime into the initial authentication bundle.
fn subscribe(
  listeners : Array[Listener],
  next : Ref[Int],
  notify : () -> Unit,
) -> () -> Unit {
  next.val += 1
  let id = next.val
  listeners.push({ id, notify, })
  fn() {
    for index in 0..<listeners.length() {
      if listeners[index].id == id {
        listeners.remove(index) |> ignore
        break
      }
    }
  }
}

///|
fn publish(listeners : Array[Listener]) -> Unit {
  for listener in listeners.copy() {
    (listener.notify)()
  }
}
