///|
#external
priv type Keys

///|
#borrow(private_pem, public_pem)
extern "C" fn c_keys(
  private_pem : Bytes,
  public_pem : Bytes,
  development : Bool,
) -> Keys = "su_keys"

///|
#borrow(keys)
extern "C" fn c_keys_ready(keys : Keys) -> Bool = "su_keys_ready"

///|
#borrow(keys)
extern "C" fn c_keys_close(keys : Keys) -> Unit = "su_keys_close"

///|
#borrow(keys, data)
extern "C" fn c_sign(keys : Keys, data : Bytes) -> Bytes = "su_sign"

///|
#borrow(keys, data, signature)
extern "C" fn c_verify(keys : Keys, data : Bytes, signature : Bytes) -> Bool = "su_verify"

///|
#borrow(key, data)
extern "C" fn c_hmac(key : Bytes, data : Bytes) -> Bytes = "su_hmac"

///|
extern "C" fn c_random() -> Bytes = "su_random"

///|
extern "C" fn c_now() -> Double = "su_now"

///|
extern "C" fn c_datetime(ms : Double) -> Bytes = "su_datetime"

///|
extern "C" fn c_date(
  y : Int,
  m : Int,
  day : Int,
  h : Int,
  min : Int,
  sec : Int,
) -> Double = "su_date"

///|
extern "C" fn c_bootstrap() -> Unit = "su_bootstrap"
