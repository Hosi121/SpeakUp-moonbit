///|
fn profile_row(id : Int, name : String) -> DbRow {
  DbRow(
    Map([
      ("id", Number(id.to_double())),
      ("username", Text(name)),
      ("email", Text(name + "@example.test")),
      ("avatar_url", Text("/avatar.png")),
      ("role", Text("USER")),
      ("created_at", Text("2026-09-24 00:00:00")),
      ("updated_at", Text("2026-09-24 00:00:00")),
    ]),
  )
}

///|
fn test_host(prefix : String, run : async (Statement) -> DbResult) -> Host {
  {
    database: {
      run,
      transaction: fn(_) raise { fail("Unexpected transaction") },
    },
    authenticate: fn(_, _) raise { fail("Unexpected authentication") },
    issue_token: fn(_) raise { fail("Unexpected token request") },
    chat: fn(_, _) raise { fail("Unexpected AI request") },
    now: fn() { "2026-09-24 00:00:00" },
    now_millis: fn() { 1000 },
    public_url: fn(path) { prefix + path },
    event_times: fn(_) { None },
  }
}

///|
async test "reentrant APIs retain their database and projection capabilities" {
  let second = Api(
    test_host("https://second.example", async fn(statement) {
      @async.sleep(0)
      guard statement.params is [Number(20)] else { fail("Wrong second user") }
      Rows([profile_row(20, "second")])
    }),
  )
  let first = Api(
    test_host("https://first.example", async fn(statement) {
      guard statement.params is [Number(10)] else { fail("Wrong first user") }
      let other = second.execute("GET", "/user/info", 20, "", "")
      assert_eq(other.status, 200)
      let profile : @shared.UserProfileDto = @json.from_json(
        @json.parse(other.body),
      )
      assert_eq(profile.avatar_url, "https://second.example/avatar.png")
      Rows([profile_row(10, "first")])
    }),
  )
  let result = first.execute("GET", "/user/info", 10, "", "")
  assert_eq(result.status, 200)
  let profile : @shared.UserProfileDto = @json.from_json(
    @json.parse(result.body),
  )
  assert_eq(profile.id, 10)
  assert_eq(profile.username, "first")
  assert_eq(profile.avatar_url, "https://first.example/avatar.png")
}
