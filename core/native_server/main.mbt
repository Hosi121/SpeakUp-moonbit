///|
priv suberror RequestError {
  BadRequest
}

///|
let relay : @transport.Relay = @transport.Relay()

///|
priv struct ConversationWork {
  lock : @async.Mutex
  mut users : Int
}

///|
let work : Map[Int, ConversationWork] = Map([])

///|
async fn[T] with_conversation(id : Int, f : async () -> T) -> T {
  let entry = work.get_or_init(id, fn() { { lock: @async.Mutex(), users: 0, } })
  entry.users += 1
  defer {
    entry.users -= 1
    if entry.users == 0 {
      work.remove(id)
    }
  }
  entry.lock.acquire()
  defer entry.lock.release()
  f()
}

///|
fn publish_conversation(body : String) -> Unit raise {
  let conversation = @shared.parse_conversation(body)
  relay.publish(
    conversation.id,
    "{\"type\":\"conversation\",\"value\":" + body + "}",
    conversation.ended_at > 0 || conversation.cancelled_at > 0,
  )
}

///|
async fn connection(
  request : @http.Request,
  conn : @http.ServerConnection,
  service : @async.TaskGroup[Unit],
) -> Unit {
  let ws = @websocket.from_http_server(request, conn)
  defer conn.close()
  relay.with_peer(ws, async fn(peer) {
    let (uid, conversation_id) = @async.with_timeout(5000, async fn() {
      let message = ws.recv()
      guard message.kind is Text else { raise BadRequest }
      let text = @utf8.decode(@transport.limited_body(message, 65536))
      let auth = @shared.parse_signal(text)
      guard auth.kind == "Authorization" else { raise BadRequest }
      let uid = @host.verify_token(auth.token)
      with_conversation(auth.room, async fn() {
        let result = @api.execute(
          "GET",
          "/conversations/\{auth.room}",
          uid,
          "",
          "",
        )
        guard result.status == 200 else { raise BadRequest }
        let conversation = @shared.parse_conversation(result.body)
        guard conversation.ended_at == 0 && conversation.cancelled_at == 0 else {
          raise BadRequest
        }
        relay.join(peer, uid, auth.room)
        relay.send(
          peer,
          "{\"type\":\"conversation\",\"value\":" + result.body + "}",
        )
      })
      (uid, auth.room)
    })
    let mut count = 0
    let mut window_start = @host.now_millis()
    for ;; {
      let message = ws.recv()
      guard message.kind is Text else { raise BadRequest }
      let now = @host.now_millis()
      if now - window_start > 1000 {
        count = 0
        window_start = now
      }
      count += 1
      guard count <= 100 else { raise BadRequest }
      let text = @utf8.decode(@transport.limited_body(message, 65536))
      if relay.receive(peer, text) {
        // Persist the command independently; subsequent ICE frames keep flowing.
        service.spawn_bg(allow_failure=true, async fn() {
          with_conversation(conversation_id, async fn() {
            let result = @api.execute(
              "POST",
              "/conversations/\{conversation_id}/start",
              uid,
              "",
              "",
            )
            if result.status == 200 {
              publish_conversation(result.body)
            } else {
              relay.publish(
                conversation_id, "{\"type\":\"error\",\"error\":\"Could not start conversation\"}",
                true,
              )
            }
          })
        })
      }
    }
  })
  @transport.drain_close(conn)
}

///|
fn header(request : @http.Request, name : String) -> String {
  request.headers.get_or_default(@http.CaseInsensitiveString(name), "")
}

///|
fn headers(
  origin : String,
  content_type? : String = "application/json; charset=utf-8",
) -> @http.Headers {
  let result = Map([
    (@http.CaseInsensitiveString("Content-Type"), content_type),
    (
      @http.CaseInsensitiveString("Access-Control-Allow-Headers"),
      "Authorization, Content-Type",
    ),
    (
      @http.CaseInsensitiveString("Access-Control-Allow-Methods"),
      "GET,POST,PUT,OPTIONS",
    ),
    (@http.CaseInsensitiveString("X-Content-Type-Options"), "nosniff"),
    (@http.CaseInsensitiveString("Cache-Control"), "no-store"),
  ])
  if origin != "" {
    result[@http.CaseInsensitiveString("Access-Control-Allow-Origin")] = origin
    result[@http.CaseInsensitiveString("Vary")] = "Origin"
  }
  result
}

///|
async fn respond(
  conn : @http.ServerConnection,
  status : Int,
  body : &@io.Data,
  origin : String,
  content_type? : String,
) -> Unit {
  conn.send_response(status, "", extra_headers=headers(origin, content_type?))
  if status != 204 {
    conn.write(body)
  }
  conn.end_response()
}

///|
fn upload_name(path : String) -> String? {
  guard path.has_prefix("/upload/") else { return None }
  let name = path[8:].to_owned()
  let parts = name.split(".").to_array()
  guard parts.length() == 2 &&
    !parts[0].is_empty() &&
    parts[0]
    .iter()
    .all(c => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || c == '-') &&
    (parts[1] == "png" || parts[1] == "jpg" || parts[1] == "webp") else {
    return None
  }
  Some(name)
}

///|
fn find_bytes(data : Bytes, needle : Bytes, start : Int) -> Int? {
  data[start:].find(needle).map(offset => start + offset)
}

///|
async fn upload(
  request : @http.Request,
  conn : @http.ServerConnection,
) -> String {
  let content_type = header(request, "Content-Type")
  guard content_type.has_prefix("multipart/form-data;") else {
    raise BadRequest
  }
  let mut boundary = ""
  for part in content_type.split(";") {
    let p = part.trim().to_owned()
    if p.has_prefix("boundary=") {
      boundary = p[9:].to_owned()
      if boundary.has_prefix("\"") &&
        boundary.has_suffix("\"") &&
        boundary.length() >= 2 {
        boundary = boundary[1:boundary.length() - 1].to_owned()
      }
    }
  }
  guard boundary.length() > 0 &&
    boundary.length() <= 70 &&
    boundary.iter().all(c => c >= ' ' && c <= '~') else {
    raise BadRequest
  }
  let raw = @transport.limited_body(conn, 2 * 1024 * 1024)
  let delimiter = @utf8.encode("\r\n--" + boundary)
  let initial = @utf8.encode("--" + boundary + "\r\n")
  guard raw.length() >= initial.length() && raw[:initial.length()] == initial[:] else {
    raise BadRequest
  }
  let mut offset = initial.length()
  let mut avatar : Bytes? = None
  for ;; {
    let end_headers = find_bytes(raw, b"\r\n\r\n", offset).unwrap_or(-1)
    guard end_headers >= offset && end_headers - offset <= 8192 else {
      raise BadRequest
    }
    let part_headers = @utf8.decode(raw[offset:end_headers])
    let begin = end_headers + 4
    let end = find_bytes(raw, delimiter, begin).unwrap_or(-1)
    guard end >= begin else { raise BadRequest }
    if part_headers
      .split("\r\n")
      .any(line => {
        line.to_owned().to_lower().has_prefix("content-disposition: form-data;") &&
        line.split(";").any(part => part.trim() == "name=\"avatar\"") &&
        line.split(";").any(part => part.trim().has_prefix("filename="))
      }) {
      guard avatar is None else { raise BadRequest }
      avatar = Some(raw[begin:end].to_owned())
    }
    offset = end + delimiter.length()
    guard offset + 2 <= raw.length() else { raise BadRequest }
    if raw[offset:offset + 2] == b"--"[:] {
      break
    }
    guard raw[offset:offset + 2] == b"\r\n"[:] else { raise BadRequest }
    offset += 2
  }
  let data = avatar.unwrap_or(b"")
  let extension = if data.length() >= 8 && data[:8] == b"\x89PNG\r\n\x1a\n"[:] {
    "png"
  } else if data.length() >= 3 && data[:3] == b"\xff\xd8\xff"[:] {
    "jpg"
  } else if data.length() >= 12 &&
    data[:4] == b"RIFF"[:] &&
    data[8:12] == b"WEBP"[:] {
    "webp"
  } else {
    raise BadRequest
  }
  @fs.mkdir("uploads") catch {
    @os_error.OSError(_) as e if e.is_EEXIST() => {
      guard @fs.kind("uploads") is Directory else { raise e }
    }
    e => raise e
  }
  let name = @host.random_name() + "." + extension
  @fs.write_file("uploads/" + name, data, create_mode=CreateNew)
  ({ "avatar_url": ("/upload/" + name).to_json() } : Json).stringify()
}

///|
async fn handle(
  request : @http.Request,
  conn : @http.ServerConnection,
  service : @async.TaskGroup[Unit],
) -> Unit {
  let origin = header(request, "Origin")
  let allowed = @host.env(
      "ALLOWED_ORIGINS",
      fallback="http://localhost:5173,http://127.0.0.1:5173",
    )
    .split(",")
    .any(s => s == origin)
  if origin != "" && !allowed {
    respond(conn, 403, "", "")
    conn.close()
    return
  }
  if header(request, "Upgrade").to_lower() == "websocket" {
    if request.path != "/ws" ||
      !allowed ||
      origin == "" ||
      relay.size() >= 10000 {
      respond(conn, 403, "", "")
      conn.close()
      return
    }
    connection(request, conn, service)
    return
  }
  if request.meth is Options {
    respond(conn, 204, "", origin)
    return
  }
  try {
    let url = request.path.split("?").to_array()
    let path = @host.decode_url(url[0].to_owned())
    let segments = path.split("/").to_array()
    if segments.length() == 4 &&
      segments[1] == "conversations" &&
      segments[3] == "start" {
      respond(
        conn, 405, "{\"error\":\"Begin requires media negotiation\"}", origin,
      )
      return
    }
    if request.meth is Get && upload_name(path) is Some(name) {
      let data = @fs.read_file("uploads/" + name)
      let extension = name.split(".").to_array()[1].to_owned()
      respond(
        conn,
        200,
        data,
        origin,
        content_type="image/" +
          (if extension == "jpg" { "jpeg" } else { extension }),
      )
      return
    }
    let uid = if path == "/health" || path == "/signin" || path == "/signup" {
      0
    } else {
      @host.verify_token(header(request, "Authorization")) catch {
        _ => {
          respond(conn, 401, "{\"error\":\"Authentication required\"}", origin)
          return
        }
      }
    }
    if request.meth is Get && path == "/rtc-config" {
      respond(conn, 200, @host.rtc_config(uid), origin)
      return
    }
    let input = if request.meth is Put && path == "/user/avatar" {
      upload(request, conn)
    } else if request.meth is (Post | Put) {
      @utf8.decode(@transport.limited_body(conn, 65536))
    } else {
      ""
    }
    let verb = match request.meth {
      Get => "GET"
      Post => "POST"
      Put => "PUT"
      _ => "OTHER"
    }
    let mut query = ""
    if url.length() == 2 {
      for pair in url[1].split("&") {
        let kv = pair.split("=").to_array()
        if kv.length() == 2 && kv[0] == "q" {
          query = @host.decode_url(kv[1].to_owned(), plus=true)
          break
        }
      }
    }
    let terminal = request.meth is Post &&
      segments.length() == 4 &&
      segments[1] == "conversations" &&
      (segments[3] == "finish" || segments[3] == "cancel")
    let run = async fn() {
      let result = @api.execute(verb, path, uid, input, query)
      if terminal && result.status == 200 {
        publish_conversation(result.body)
      }
      result
    }
    let result = if terminal {
      let id : Int = @json.from_json(@json.parse(segments[2].to_owned()))
      with_conversation(id, run)
    } else {
      run()
    }
    respond(conn, result.status, result.body, origin)
  } catch {
    @transport.TooLarge => {
      respond(conn, 413, "{\"error\":\"Invalid request\"}", origin)
      conn.close()
    }
    _ => {
      respond(conn, 400, "{\"error\":\"Invalid request\"}", origin)
      conn.close()
    }
  }
}

///|
async fn main {
  @signal.set_global_cancellation_signals([SIGINT, SIGTERM])
  @host.initialize()
  defer @host.close()
  defer relay.close()
  let addr = @host.env("HOST", fallback="127.0.0.1") +
    ":" +
    @host.env("PORT", fallback="8081")
  let server = @http.Server(@socket.Addr::parse(addr), reuse_addr=true)
  defer server.close()
  println("SpeakUp MoonBit native listening on " + addr)
  let mut active = 0
  @async.with_task_group(async fn(group) {
    for ;; {
      let (conn, _) = server.accept()
      if active >= 10000 {
        conn.close()
        continue
      }
      active += 1
      group.spawn_bg(allow_failure=true, async fn() {
        defer {
          active -= 1
          conn.close()
        }
        for ;; {
          let request = @async.with_timeout(10000, async fn() {
            conn.read_request()
          })
          if header(request, "Upgrade").to_lower() == "websocket" {
            handle(request, conn, group)
            break
          }
          @async.with_timeout(30000, async fn() { handle(request, conn, group) })
          if header(request, "Connection").to_lower() == "close" {
            break
          }
        }
      })
    }
  })
}
