///|
pub struct Peer {
  id : Int
  priv session : @session.Session
}

///|
pub struct Relay {
  priv hub : Int
  priv peers : Map[Int, Peer]
  priv mut serial : Int
  priv mut closed : Bool
}

///|
pub fn Relay::Relay() -> Relay {
  { hub: @signaling.create_hub(), peers: Map([]), serial: 0, closed: false, }
}

///|
pub fn Relay::close(self : Relay) -> Unit {
  if !self.closed {
    self.closed = true
    for peer in self.peers.values() {
      peer.session.close()
    }
    @signaling.destroy_hub(self.hub)
  }
}

///|
pub fn Relay::size(self : Relay) -> Int {
  self.peers.length()
}

///|
fn Relay::deliver(self : Relay, messages : Array[@signaling.Delivery]) -> Unit {
  for message in messages {
    if self.peers.get(message.connection) is Some(peer) {
      if message.close_code == 0 {
        ignore(peer.session.send(message.payload))
      } else {
        let code : @websocket.CloseCode = match message.close_code {
          1000 => Normal
          1008 => PolicyViolation
          1009 => MessageTooBig
          _ => InternalError
        }
        ignore(peer.session.finish(message.payload, code~))
      }
    }
  }
}

///|
pub fn Relay::join(self : Relay, peer : Peer, user : Int, room : Int) -> Unit {
  self.deliver(@signaling.join(self.hub, peer.id, user, room))
}

///|
pub fn Relay::send(_self : Relay, peer : Peer, payload : String) -> Unit {
  ignore(peer.session.send(payload))
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
pub async fn Relay::with_peer(
  self : Relay,
  ws : @websocket.Conn,
  heartbeat? : Bool = true,
  handle : async (Peer) -> Unit,
) -> Unit {
  if self.closed || self.serial == 2147483647 {
    @async.with_timeout(1000, async fn() { ws.send_close(code=Other(1013)) })
    return
  }
  self.serial += 1
  let id = self.serial
  defer {
    self.peers.remove(id)
    if !self.closed {
      self.deliver(@signaling.leave(self.hub, id))
    }
  }
  @session.with_session(
    ws,
    heartbeat~,
    on_error=error => {
      match error {
        @native_io.TooLarge => MessageTooBig
        _ => PolicyViolation
      }
    },
    async fn(session) {
      let peer = { id, session, }
      self.peers[id] = peer
      handle(peer)
    },
  )
}
