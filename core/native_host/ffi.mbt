///|
#external
priv type Database

///|
#external
priv type Keys

///|
#borrow(host, user, pass, name)
extern "C" fn c_db_new(
  host : Bytes,
  user : Bytes,
  pass : Bytes,
  name : Bytes,
  port : Int,
) -> Database = "su_db_new"

///|
#borrow(db)
extern "C" fn c_db_fd(db : Database) -> Int = "su_db_fd"

///|
#borrow(db)
extern "C" fn c_db_reset(
  db : Database,
  count : Int,
  transaction : Bool,
) -> Unit = "su_db_reset"

///|
#borrow(db, sql)
extern "C" fn c_db_statement(
  db : Database,
  index : Int,
  sql : Bytes,
  count : Int,
) -> Unit = "su_db_statement"

///|
#borrow(db, data)
extern "C" fn c_db_param(
  db : Database,
  index : Int,
  col : Int,
  kind : Int,
  data : Bytes,
  number : Double,
) -> Unit = "su_db_param"

///|
#borrow(db)
extern "C" fn c_db_submit(db : Database) -> Unit = "su_db_submit"

///|
#borrow(db)
extern "C" fn c_db_error(db : Database) -> Int = "su_db_error"

///|
#borrow(db)
extern "C" fn c_db_rows(db : Database) -> Int = "su_db_rows"

///|
#borrow(db)
extern "C" fn c_db_cols(db : Database) -> Int = "su_db_cols"

///|
#borrow(db)
extern "C" fn c_db_numeric(db : Database, col : Int) -> Bool = "su_db_numeric"

///|
#borrow(db)
extern "C" fn c_db_null(db : Database, row : Int, col : Int) -> Bool = "su_db_null"

///|
#borrow(db)
extern "C" fn c_db_name(db : Database, col : Int) -> Bytes = "su_db_name"

///|
#borrow(db)
extern "C" fn c_db_cell(db : Database, row : Int, col : Int) -> Bytes = "su_db_cell"

///|
#borrow(db)
extern "C" fn c_db_affected(db : Database) -> Double = "su_db_affected"

///|
#borrow(db)
extern "C" fn c_db_insert_id(db : Database) -> Double = "su_db_insert_id"

///|
#borrow(db)
extern "C" fn c_db_close(db : Database) -> Unit = "su_db_close"

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
