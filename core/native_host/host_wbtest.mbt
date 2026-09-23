///|
test "native RSA signing verifies and rejects a modified message" {
  let k = c_keys(b"", b"", true)
  defer c_keys_close(k)
  assert_true(c_keys_ready(k))
  let signature = c_sign(k, b"hello")
  assert_eq(signature.length(), 256)
  assert_true(c_verify(k, b"hello", signature))
  assert_false(c_verify(k, b"altered", signature))
  let token = issue_token(k, @identity.UserId::from_int(1))
  assert_eq(verify_token(k, "Bearer " + token), 1)
}

///|
test "base64url replaces every occurrence and preserves binary data" {
  let bytes = b"\xfb\xff\xff\xfb\xff\xff\xfb\xff\xff"
  let encoded = base64url(bytes)
  assert_false(
    encoded.contains("+") || encoded.contains("/") || encoded.contains("="),
  )
  assert_eq(unbase64(encoded), bytes)
}

///|
test "native event dates validate before timezone normalization" {
  let expected : Json = {
    "start": "2026-09-22 00:00:00",
    "end": "2026-09-22 00:30:00",
  }
  for
    date in [
      "2026-09-22T09:00:00+09:00", "2026-09-22 00:00:00", "2026-09-22T00:00:00.123456789Z",
    ] {
    guard event_times(date) is Some(times) else { fail("missing event times") }
    assert_eq(
      ({ "start": times.start.to_json(), "end": times.end.to_json() } : Json),
      expected,
    )
  }
  for
    date in [
      "2026-02-30T00:00:00Z", "2026-01-01T24:00:00", "2026-09-22", "2026-09-22T00:00:00+25:00",
      "2026-09-22T00:00:00.Z",
    ] {
    assert_true(event_times(date) is None)
  }
  assert_eq(decode_url("%E6%97%A5%E6%9C%AC+%2B", plus=true), "日本 +")
}
