///|
pub(all) suberror TooLarge

///|
pub(all) suberror InvalidLimits

///|
priv struct Message {
  payload : String
  bytes : Int
  close_code : @ws.CloseCode?
}

///|
pub struct Peer {
  id : Int
  priv ws : @ws.Conn
  priv output : @async.Queue[Message]
  priv max_bytes : Int
  priv max_messages : Int
  priv finished : @async.Queue[Unit]
  priv mut finishing : Bool
  priv mut bytes : Int
  priv mut messages : Int
  priv mut closing : Bool
}

///|
pub struct Connections {
  priv clients : Map[Int, Peer]
  priv max_bytes : Int
  priv max_messages : Int
  priv write_timeout : Int
  priv heartbeat : Int
  priv close_timeout : Int
  priv mut serial : Int
  priv mut closed : Bool
}

///|
pub fn Connections::new(
  max_pending_bytes? : Int = 262144,
  max_pending_messages? : Int = 1024,
  write_timeout_ms? : Int = 30000,
  heartbeat_ms? : Int = 30000,
  close_timeout_ms? : Int = 1000,
) -> Connections raise InvalidLimits {
  guard max_pending_bytes > 0 &&
    max_pending_messages > 0 &&
    write_timeout_ms > 0 &&
    heartbeat_ms > 0 &&
    close_timeout_ms > 0 else {
    raise InvalidLimits
  }
  {
    clients: Map([]),
    max_bytes: max_pending_bytes,
    max_messages: max_pending_messages,
    write_timeout: write_timeout_ms,
    heartbeat: heartbeat_ms,
    close_timeout: close_timeout_ms,
    serial: 0,
    closed: false,
  }
}

///|
pub fn Connections::size(self : Connections) -> Int {
  self.clients.length()
}

///|
pub fn Connections::get(self : Connections, id : Int) -> Peer? {
  self.clients.get(id)
}

///|
pub fn Peer::close(self : Peer) -> Unit {
  self.closing = true
  self.ws.close()
}

///|
pub fn Connections::close(self : Connections) -> Unit {
  self.closed = true
  for peer in self.clients.values() {
    peer.close()
  }
}

///|
fn Peer::enqueue(
  self : Peer,
  payload : String,
  close_code : @ws.CloseCode?,
) -> Bool {
  if self.closing {
    return false
  }
  let bytes = @utf8.encode(payload).length()
  if bytes > self.max_bytes - self.bytes || self.messages >= self.max_messages {
    self.close()
    return false
  }
  self.bytes += bytes
  self.messages += 1
  let queued = self.output.try_put({ payload, bytes, close_code, }) catch {
    _ => false
  }
  if !queued {
    self.close()
  }
  if queued && close_code is Some(_) {
    self.closing = true
    self.finishing = true
  }
  queued
}

///|
/// False means closed or overloaded. Overflow disconnects the slow consumer.
pub fn Peer::send(self : Peer, payload : String) -> Bool {
  self.enqueue(payload, None)
}

///|
/// Send one final payload followed by the close frame, in that order.
/// with_peer also flushes this final message if the handler returns immediately.
pub fn Peer::finish(
  self : Peer,
  payload : String,
  code? : @ws.CloseCode = Normal,
) -> Bool {
  self.enqueue(payload, Some(code))
}

///|
/// Owns writer/heartbeat tasks within the callback's lifetime. Exceptions are
/// reported to on_error before sending its close code. Caller owns HTTP conn.
pub async fn Connections::with_peer(
  self : Connections,
  ws : @ws.Conn,
  heartbeat? : Bool = true,
  on_leave? : (Int) -> Unit = _ => (),
  on_error? : (Error) -> @ws.CloseCode = _ => InternalError,
  handle : async (Peer) -> Unit,
) -> Unit {
  if self.closed || self.serial == 2147483647 {
    @async.with_timeout(self.close_timeout, async fn() {
      ws.send_close(code=Other(1013))
    })
    return
  }
  self.serial += 1
  let peer = {
    id: self.serial,
    ws,
    output: @async.Queue(kind=Unbounded),
    max_bytes: self.max_bytes,
    max_messages: self.max_messages,
    finished: @async.Queue(kind=Unbounded),
    finishing: false,
    bytes: 0,
    messages: 0,
    closing: false,
  }
  self.clients[peer.id] = peer
  defer {
    peer.closing = true
    peer.output.close(clear=true)
    self.clients.remove(peer.id)
    on_leave(peer.id)
  }
  @async.with_task_group(async fn(group) {
    group.spawn_bg(no_wait=true, async fn() {
      for ;; {
        let message = peer.output.get()
        @async.with_timeout(self.write_timeout, async fn() {
          ws.send_text(message.payload)
        })
        peer.bytes -= message.bytes
        peer.messages -= 1
        if message.close_code is Some(code) {
          @async.with_timeout(self.close_timeout, async fn() {
            ws.send_close(code~)
          })
          peer.finished.put(())
          @async.sleep(self.close_timeout)
          ws.close()
          break
        }
      }
    })
    if heartbeat {
      group.spawn_bg(no_wait=true, async fn() {
        for ;; {
          @async.sleep(self.heartbeat)
          @async.with_timeout(self.write_timeout, async fn() { ws.ping() })
        }
      })
    }
    handle(peer)
    if peer.finishing {
      @async.with_timeout(self.write_timeout, async fn() { peer.finished.get() })
    }
  }) catch {
    @ws.ConnectionClosed(_, _) => ()
    error => {
      let code = match error {
        TooLarge => @ws.MessageTooBig
        _ => on_error(error)
      }
      @async.with_timeout(self.close_timeout, async fn() {
        ws.send_close(code~)
      }) catch {
        _ => ()
      }
    }
  }
}

///|
pub async fn limited_body(reader : &@io.Reader, limit : Int) -> Bytes {
  guard limit >= 0 else { raise InvalidLimits }
  let data = @buffer.Buffer()
  while reader.read_some(max_len=8192) is Some(chunk) {
    guard chunk.length() <= limit - data.length() else { raise TooLarge }
    data.write_bytes(chunk)
  }
  data.to_bytes()
}

///|
/// async 0.22.1 stops its WebSocket reader after send_close. After every reader
/// and writer task has stopped, drain the remaining close reply to avoid RST.
pub async fn drain_close(conn : @http.ServerConnection) -> Unit {
  defer conn.close()
  ignore(
    @async.with_timeout_opt(250, async fn() {
      let mut total = 0
      while conn.read_some(max_len=4096) is Some(bytes) {
        total += bytes.length()
        if total >= 65536 {
          break
        }
      }
    }) catch {
      _ => None
    },
  )
}
