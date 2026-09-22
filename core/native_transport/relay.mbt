///|
pub(all) suberror TooLarge

///|
pub struct Peer {
  id : Int
  priv ws : @websocket.Conn
  priv output : @async.Queue[@signaling.Delivery]
  priv mut bytes : Int
  priv mut closing : Bool
}

///|
pub struct Relay {
  priv hub : Int
  priv clients : Map[Int, Peer]
  priv mut serial : Int
}

///|
pub fn Relay::Relay() -> Relay {
  { hub: @signaling.create_hub(), clients: Map([]), serial: 0, }
}

///|
pub fn Relay::close(self : Relay) -> Unit {
  for peer in self.clients.values() {
    peer.ws.close()
  }
  @signaling.destroy_hub(self.hub)
}

///|
pub fn Relay::size(self : Relay) -> Int {
  self.clients.length()
}

///|
fn Relay::deliver(self : Relay, messages : Array[@signaling.Delivery]) -> Unit {
  for message in messages {
    if self.clients.get(message.connection) is Some(peer) && !peer.closing {
      let size = @utf8.encode(message.payload).length()
      if peer.bytes + size > 256 * 1024 {
        peer.closing = true
        peer.ws.close()
      } else {
        peer.bytes += size
        ignore(peer.output.try_put(message) catch { _ => false })
        if message.close_code != 0 {
          peer.closing = true
        }
      }
    }
  }
}

///|
pub fn Relay::join(self : Relay, peer : Peer, user : Int, room : Int) -> Unit {
  self.deliver(@signaling.join(self.hub, peer.id, user, room))
}

///|
pub fn Relay::send(self : Relay, peer : Peer, payload : String) -> Unit {
  self.deliver([{ connection: peer.id, payload, close_code: 0, }])
}

///|
pub fn Relay::receive(self : Relay, peer : Peer, text : String) -> Bool {
  let received = @signaling.receive(self.hub, peer.id, text)
  self.deliver(received.deliveries)
  received.media_ready
}

///|
pub fn Relay::publish(
  self : Relay,
  room : Int,
  payload : String,
  terminal : Bool,
) -> Unit {
  self.deliver(@signaling.publish(self.hub, room, payload, terminal))
}

///|
pub async fn limited_body(reader : &@io.Reader, limit : Int) -> Bytes {
  let data = @buffer.Buffer()
  while reader.read_some(max_len=8192) is Some(chunk) {
    guard data.length() + chunk.length() <= limit else { raise TooLarge }
    data.write_bytes(chunk)
  }
  data.to_bytes()
}

///|
fn close_code(code : Int) -> @websocket.CloseCode {
  match code {
    1000 => Normal
    1008 => PolicyViolation
    1009 => MessageTooBig
    _ => InternalError
  }
}

///|
/// One writer per socket, bounded pending bytes, and structured cancellation.
/// Both the production controller and isolated relay benchmark use this path.
/// The caller retains socket ownership and calls drain_close after this scope.
pub async fn Relay::with_peer(
  self : Relay,
  ws : @websocket.Conn,
  heartbeat? : Bool = true,
  handle : async (Peer) -> Unit,
) -> Unit {
  if self.serial == 2147483647 {
    ws.send_close(code=Other(1013))
    return
  }
  self.serial += 1
  let peer = {
    id: self.serial,
    ws,
    output: @async.Queue(kind=Unbounded),
    bytes: 0,
    closing: false,
  }
  self.clients[peer.id] = peer
  defer {
    peer.output.close(clear=true)
    self.clients.remove(peer.id)
    self.deliver(@signaling.leave(self.hub, peer.id))
  }
  @async.with_task_group(async fn(group) {
    group.spawn_bg(no_wait=true, async fn() {
      for ;; {
        let message = peer.output.get()
        @async.with_timeout(30000, async fn() { ws.send_text(message.payload) })
        peer.bytes -= @utf8.encode(message.payload).length()
        if message.close_code != 0 {
          ws.send_close(code=close_code(message.close_code))
          // Bound the close handshake if the peer never replies.
          @async.sleep(1000)
          ws.close()
          break
        }
      }
    })
    if heartbeat {
      group.spawn_bg(no_wait=true, async fn() {
        for ;; {
          @async.sleep(30000)
          @async.with_timeout(30000, async fn() { ws.ping() })
        }
      })
    }
    handle(peer)
  }) catch {
    TooLarge =>
      @async.with_timeout(1000, async fn() { ws.send_close(code=MessageTooBig) }) catch {
        _ => ()
      }
    @websocket.ConnectionClosed(_, _) => ()
    _ =>
      @async.with_timeout(1000, async fn() {
        ws.send_close(code=PolicyViolation)
      }) catch {
        _ => ()
      }
  }
}

///|
/// async 0.22.1 stops its WebSocket reader after send_close, so part of the
/// peer's close reply may remain unread. Draining the underlying passthrough
/// stream before closing avoids a TCP reset through reverse proxies.
/// All WebSocket reader/writer tasks must have finished before calling this.
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
