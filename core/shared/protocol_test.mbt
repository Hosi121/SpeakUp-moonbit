///|
test "wire validation restricts direction and keeps legacy role and optional ICE semantics" {
  let auth = "{\"type\":\"Authorization\",\"token\":\"Bearer x\",\"room\":2}"
  assert_true(@shared.parse_authorization(auth) is Some(_))
  assert_true(@shared.parse_client_signal(auth) is None)
  assert_true(@shared.parse_server_signal(auth) is None)
  assert_true(@shared.parse_server_signal("{\"type\":\"media-ready\"}") is None)
  assert_true(
    @shared.parse_client_signal("{\"type\":\"callType\",\"isOffer\":true}")
    is None,
  )
  assert_true(
    @shared.parse_server_signal("{\"type\":\"callType\"}")
    is Some(Assigned(Answerer)),
  )
  let text = "{\"type\":\"ice-candidate\",\"candidate\":{\"candidate\":\"\",\"sdpMid\":null,\"sdpMLineIndex\":0}}"
  guard @shared.parse_client_signal(text) is Some(Peer(Ice(ice))) else {
    fail("Expected ICE")
  }
  assert_true(ice.mid is None)
  assert_true(ice.line is Some(0))
  assert_true(ice.username is None)
  assert_true(
    @shared.parse_client_signal(
      "{\"type\":\"ice-candidate\",\"candidate\":{\"candidate\":\"x\",\"sdpMLineIndex\":0.5}}",
    )
    is None,
  )
}
