///|
pub(all) suberror DecodeError {
  InvalidField(String)
}

///|
/// Finite, integral, and exactly representable on both native and JavaScript.
pub fn is_safe_integer(value : Double) -> Bool {
  value >= -9007199254740991.0 &&
  value <= 9007199254740991.0 &&
  value.trunc() == value
}

///|
pub fn integer(
  value : Json,
  minimum? : Double = -9007199254740991.0,
  maximum? : Double = 9007199254740991.0,
) -> Double raise DecodeError {
  guard value is Number(n, ..) &&
    is_safe_integer(n) &&
    n >= minimum &&
    n <= maximum else {
    raise InvalidField("Expected a safe integer in range")
  }
  n
}

///|
pub fn field(value : Json, key : String) -> Json raise DecodeError {
  guard value is Object(fields) && fields.get(key) is Some(result) else {
    raise InvalidField(key)
  }
  result
}

///|
/// Validate before FromJson can truncate a fraction or narrow an integer.
pub fn integer_field(
  value : Json,
  key : String,
  minimum : Double,
  maximum : Double,
) -> Unit raise DecodeError {
  ignore(integer(field(value, key), minimum~, maximum~)) catch {
    _ => raise InvalidField(key)
  }
}

///|
pub fn int(
  value : Json,
  minimum? : Int = -2147483648,
  maximum? : Int = 2147483647,
) -> Int raise DecodeError {
  integer(value, minimum=minimum.to_double(), maximum=maximum.to_double()).to_int()
}

///|
/// Parse and validate at ingress; the decoder owns the concrete domain schema.
pub fn[T] decode(text : String, decoder : (Json) -> T raise) -> T raise {
  decoder(@json.parse(text))
}

///|
/// A JS export wraps this with a concrete return type. Exceptions become JS
/// errors; no MoonBit Result/Json/Option representation crosses the ABI.
pub fn[T] decode_or_throw(text : String, decoder : (Json) -> T raise) -> T {
  try! decode(text, decoder)
}
