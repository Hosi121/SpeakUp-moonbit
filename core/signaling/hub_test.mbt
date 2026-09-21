///|
test "readiness and disconnect work on native as well as JS" {
  let hub = @signaling.create_hub()
  defer @signaling.destroy_hub(hub)
  assert_eq(@signaling.join(hub, 1, 11, 9).length(), 1)
  assert_eq(@signaling.join(hub, 2, 12, 9).length(), 2)
  assert_eq(@signaling.connection_count(hub), 2)
  assert_eq(@signaling.leave(hub, 2).length(), 1)
  assert_eq(@signaling.leave(hub, 2).length(), 0)
  assert_eq(@signaling.connection_count(hub), 1)
}
