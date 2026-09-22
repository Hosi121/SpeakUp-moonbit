///|
/// Synthetic admission only in this separate benchmark executable. Production
/// always verifies JWT and persisted membership before joining the same relay.
async fn main {
  let relay = @transport.Relay()
  defer relay.close()
  let server = @http.Server(
    @socket.Addr::parse(
      "127.0.0.1:" + @env.get_env_var("PORT").unwrap_or("18103"),
    ),
    reuse_addr=true,
  )
  server.run_forever(async fn(request, _, conn) {
    if request.path == "/health" {
      conn.send_response(200, "OK")
      conn.write("ok")
      return
    }
    let params = request.path.split("?").to_array()[1].split("&")
    let mut user = 0
    let mut room = 0
    for entry in params {
      let kv = entry.split("=").to_array()
      let n : Int = @json.from_json(@json.parse(kv[1].to_owned()))
      if kv[0] == "room" {
        room = n
      } else if kv[0] == "user" {
        user = n
      }
    }
    let ws = @websocket.from_http_server(request, conn)
    defer conn.close()
    relay.with_peer(ws, heartbeat=false, async fn(peer) {
      relay.join(peer, user, room)
      for ;; {
        let message = ws.recv()
        guard message.kind is Text else { break }
        ignore(
          relay.receive(
            peer,
            @utf8.decode(@native_io.limited_body(message, 65536)),
          ),
        )
      }
    })
    @native_io.drain_close(conn)
  })
}
