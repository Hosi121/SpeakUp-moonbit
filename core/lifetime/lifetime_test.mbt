///|
test "nested lifetimes release once in reverse order and adopt late resources" {
  let events : Array[Int] = []
  let life = @lifetime.Lifetime()
  let first = life.own(fn() { events.push(1) })
  let child = life.child()
  ignore(child.own(fn() { events.push(2) }))
  ignore(life.own(fn() { events.push(3) }))
  life.close()
  child.close()
  first.close()
  assert_eq(events.length(), 3)
  for i in 0..<3 {
    assert_eq(events[i], 3 - i)
  }
  ignore(life.own(fn() { events.push(4) }))
  assert_eq(events[3], 4)
}

///|
test "early child release unregisters it and reentrant cleanup cannot run twice" {
  let life = @lifetime.Lifetime()
  let releases = Ref(0)
  let child = life.child()
  ignore(
    child.own(fn() {
      releases.val += 1
      child.close()
      ignore(child.own(fn() { releases.val += 1 }))
    }),
  )
  child.close()
  assert_eq(releases.val, 2)
  let second = life.own(fn() { releases.val += 1 })
  second.close()
  life.close()
  assert_eq(releases.val, 3)
}
