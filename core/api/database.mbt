///|
/// The app only accepts scalar SQL values. Driver adapters validate their
/// numeric representation; arrays and objects cannot be parameters or columns.
pub(all) enum SqlValue {
  Null
  Text(String)
  Number(Double)
  Boolean(Bool)
}

///|
pub impl ToJson for SqlValue with fn to_json(self) {
  match self {
    Null => Json::null()
    Text(s) => s.to_json()
    Number(n) => n.to_json()
    Boolean(b) => b.to_json()
  }
}

///|
pub extend SqlValue with ToJson::{to_json}

///|
#cfg(target="js")
fn sql_value(value : Json) -> SqlValue raise {
  match value {
    Null => Null
    String(s) => Text(s)
    Number(n, ..) if n >= -1.7976931348623157e308 && n <= 1.7976931348623157e308 =>
      Number(n)
    True => Boolean(true)
    False => Boolean(false)
    _ => raise HostError::InvalidData
  }
}

///|
priv trait SqlParameter {
  fn to_sql(Self) -> SqlValue
}

///|
impl SqlParameter for Int with fn to_sql(self) {
  Number(self.to_double())
}

///|
impl SqlParameter for Double with fn to_sql(self) {
  Number(self)
}

///|
impl SqlParameter for String with fn to_sql(self) {
  Text(self)
}

///|
impl SqlParameter for @identity.UserId with fn to_sql(self) {
  Number(self.value().to_double())
}

///|
impl SqlParameter for @identity.ConversationId with fn to_sql(self) {
  Number(self.value().to_double())
}

///|
extend Int with SqlParameter::{to_sql}

///|
extend Double with SqlParameter::{to_sql}

///|
extend String with SqlParameter::{to_sql}

///|
extend @identity.UserId with SqlParameter::{to_sql}

///|
extend @identity.ConversationId with SqlParameter::{to_sql}

///|
pub(all) struct Statement {
  sql : String
  params : Array[SqlValue]
} derive(ToJson)

///|
pub extend Statement with ToJson::{to_json}

///|
pub struct DbRow {
  priv values : Map[String, SqlValue]
}

///|
pub fn DbRow::DbRow(values : Map[String, SqlValue]) -> DbRow {
  { values, }
}

///|
pub impl ToJson for DbRow with fn to_json(self) {
  self.values.to_json()
}

///|
pub extend DbRow with ToJson::{to_json}

///|
fn DbRow::field(self : Self, name : String) -> SqlValue raise {
  self.values
  .get(name)
  .unwrap_or_else(fn() raise { raise HostError::InvalidData })
}

///|
fn DbRow::text(self : Self, name : String) -> String raise {
  match self.field(name) {
    Text(value) => value
    Null => ""
    _ => raise HostError::InvalidData
  }
}

///|
fn DbRow::int(self : Self, name : String) -> Int raise {
  match self.field(name) {
    Number(value) if value >= -2147483648 &&
      value <= 2147483647 &&
      value.trunc() == value => value.to_int()
    _ => raise HostError::InvalidData
  }
}

///|
fn DbRow::id(self : Self, name : String) -> Int raise {
  let value = self.int(name)
  guard value > 0 else { raise HostError::InvalidData }
  value
}

///|
fn DbRow::user_id(self : Self, name : String) -> @identity.UserId raise {
  @identity.UserId::from_int(self.id(name))
}

///|
fn DbRow::conversation_id(
  self : Self,
  name : String,
) -> @identity.ConversationId raise {
  @identity.ConversationId::from_int(self.id(name))
}

///|
fn[T : @json.FromJson] DbRow::decode(self : Self) -> T raise {
  @json.from_json(self.to_json()) catch {
    _ => raise HostError::InvalidData
  }
}

///|
pub(all) struct WriteResult {
  affected_rows : Double
  insert_id : Double
}

///|
pub(all) enum DbResult {
  Rows(Array[DbRow])
  Written(WriteResult)
}

///|
fn DbResult::rows(self : Self) -> Array[DbRow] raise {
  match self {
    Rows(rows) => rows
    Written(_) => raise HostError::InvalidData
  }
}

///|
fn DbResult::written(self : Self) -> WriteResult raise {
  match self {
    Written(value) => value
    Rows(_) => raise HostError::InvalidData
  }
}

///|
/// JSON is only the Node FFI wire format; native drivers construct DbResult directly.
#cfg(target="js")
fn decode_db_result(json : Json) -> DbResult raise {
  match json {
    Array(rows) =>
      Rows(
        rows.map(fn(row) raise {
          guard row is Object(fields) else { raise HostError::InvalidData }
          let values = Map([])
          for name, value in fields {
            values[name] = sql_value(value)
          }
          DbRow(values)
        }),
      )
    { "affectedRows": Number(affected, ..), "insertId": Number(id, ..), .. } if @wire.is_safe_integer(
        affected,
      ) &&
      affected >= 0 &&
      @wire.is_safe_integer(id) &&
      id >= 0 => Written({ affected_rows: affected, insert_id: id, })
    _ => raise HostError::InvalidData
  }
}

///|
pub(all) struct Database {
  run : async (Statement) -> DbResult
  transaction : async (Array[Statement]) -> DbResult
}
