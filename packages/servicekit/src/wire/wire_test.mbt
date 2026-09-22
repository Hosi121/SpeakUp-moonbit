///|
test "JSON integers reject fractions, narrowing and overflow" {
  for text in ["1.5", "2147483648", "-2147483649", "null", "true", "\"1\""] {
    let rejected = @wire.int(@json.parse(text)) catch { _ => -77 }
    assert_eq(rejected, -77)
  }
  for text in ["1.25", "9007199254740992", "1e9999"] {
    let rejected = @wire.integer(@json.parse(text)) catch { _ => -77 }
    assert_eq(rejected, -77)
  }
  for text in ["100", "1e2", "100.000", "10000e-2", "0.1e3"] {
    assert_eq(@wire.int(@json.parse(text)), 100)
  }
  assert_eq(@wire.integer(@json.parse("9007199254740991")), 9007199254740991.0)
  assert_eq(@wire.int(@json.parse("-2147483648")), -2147483648)
  assert_eq(@wire.int(@json.parse("0e-9999")), 0)
}

///|
test "schema bounds and missing fields remain decoder errors" {
  assert_eq(@wire.field({ "id": 4 }, "id"), (4).to_json())
  assert_eq(@wire.integer((4).to_json(), minimum=1, maximum=4), 4)
  let invalid = try @wire.integer_field({ "id": 4.5 }, "id", 1, 5) catch {
    @wire.InvalidField(key) => {
      assert_eq(key, "id")
      true
    }
  } noraise {
    _ => false
  }
  assert_true(invalid)
  let missing = try @wire.field({}, "id") catch {
    @wire.InvalidField(key) => {
      assert_eq(key, "id")
      true
    }
  } noraise {
    _ => false
  }
  assert_true(missing)
}
