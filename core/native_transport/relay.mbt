///|
pub using @connections {type Peer}

///|
pub struct Relay {
  priv hub : Int
  priv peers : @connections.Connections
}

///|
pub fn Relay::Relay() -> Relay {
  { hub: @signaling.create_hub(), peers: try! @connections.Connections::new(), }
}

///|
pub fn Relay::close(self : Relay) -> Unit {
  self.peers.close()
  @signaling.destroy_hub(self.hub)
}

///|
pub fn Relay::size(self : Relay) -> Int {
  self.peers.size()
}

///|
fn Relay::deliver(self : Relay, messages : Array[@signaling.Delivery]) -> Unit {
  for message in messages {
    if self.peers.get(message.connection) is Some(peer) {
      if message.close_code == 0 {
        ignore(peer.send(message.payload))
      } else {
        let code : @websocket.CloseCode = match message.close_code {
          1000 => Normal
          1008 => PolicyViolation
          1009 => MessageTooBig
          _ => InternalError
        }
        ignore(peer.finish(message.payload, code~))
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
  ignore(peer.send(payload))
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
  self.peers.with_peer(
    ws,
    heartbeat~,
    on_error=_ => PolicyViolation,
    on_leave=id => self.deliver(@signaling.leave(self.hub, id)),
    handle,
  )
}
