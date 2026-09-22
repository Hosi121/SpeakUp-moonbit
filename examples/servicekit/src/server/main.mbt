///|
async fn main {
  @signal.set_global_cancellation_signals([SIGINT, SIGTERM])
  let peers = @connections.Connections::new(
    max_pending_bytes=4096,
    max_pending_messages=8,
  )
  defer peers.close()
  let port = @env.get_env_var("SERVICEKIT_PORT").unwrap_or("18083")
  let server = @http.Server(
    @socket.Addr::parse("127.0.0.1:" + port),
    reuse_addr=true,
  )
  defer server.close()
  @async.with_task_group(async fn(group) {
    for ;; {
      let (conn, _) = server.accept()
      group.spawn_bg(allow_failure=true, async fn() {
        defer conn.close()
        let request = @async.with_timeout(2000, async fn() {
          conn.read_request()
        })
        if request.path == "/health" {
          conn.send_response(
            200,
            "OK",
            extra_headers=Map([
              (@http.CaseInsensitiveString("Content-Type"), "text/plain"),
            ]),
          )
          conn.write(peers.size().to_string())
          conn.end_response()
        } else {
          let ws = @ws.from_http_server(request, conn)
          peers.with_peer(ws, async fn(peer) {
            if request.path == "/overflow" {
              for _ in 0..<8 {
                assert_true(peer.send(""))
              }
              assert_false(peer.send(""))
              return
            }
            if request.path == "/finish" {
              assert_true(peer.finish("goodbye"))
              assert_false(peer.send("too late"))
              return
            }
            for ;; {
              let message = ws.recv()
              let text = @utf8.decode(@connections.limited_body(message, 4096))
              if !peer.send(text) {
                break
              }
            }
          })
          @connections.drain_close(conn)
        }
      })
    }
  })
}
