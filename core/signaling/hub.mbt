///|
/// Only verified room members may enter this state machine.
priv struct Peer {
  user : Int
  room : Int
}

///|
priv enum MediaAcknowledgements {
  Neither
  One(@shared.Role)
  Both
}

///|
priv enum Negotiation {
  Ready
  OfferSent
  Negotiated(MediaAcknowledgements)
}

///|
priv struct Pair {
  first : Int
  second : Int
  offerer : Int
  mut phase : Negotiation
}

///|
/// A room with one member cannot carry negotiation or media acknowledgements.
priv enum Room {
  Waiting(Int)
  Paired(Pair)
}

///|
fn Room::connections(self : Room) -> Array[Int] {
  match self {
    Waiting(one) => [one]
    Paired(pair) => [pair.first, pair.second]
  }
}

///|
fn Pair::role(self : Pair, connection : Int) -> @shared.Role {
  if connection == self.offerer {
    Offerer
  } else {
    Answerer
  }
}

///|
priv struct Hub {
  peers : Map[Int, Peer]
  rooms : Map[Int, Room]
}

///|
let hubs : Map[Int, Hub] = Map([])

///|
let next_hub : Ref[Int] = Ref(0)

///|
pub(all) struct Delivery {
  connection : Int
  payload : String
  close_code : Int
}

///|
pub fn create_hub() -> Int {
  next_hub.val += 1
  hubs[next_hub.val] = { peers: {}, rooms: {}, }
  next_hub.val
}

///|
pub fn destroy_hub(id : Int) -> Unit {
  hubs.remove(id)
}

///|
pub fn connection_count(id : Int) -> Int {
  match hubs.get(id) {
    Some(h) => h.peers.length()
    None => 0
  }
}

///|
fn send(connection : Int, value : Json) -> Delivery {
  { connection, payload: value.stringify(), close_code: 0, }
}

///|
fn reject(connection : Int, message : String) -> Delivery {
  {
    connection,
    payload: ({ "type": "error", "error": message } : Json).stringify(),
    close_code: 1008,
  }
}

///|
pub fn join(
  id : Int,
  connection : Int,
  user : Int,
  room_id : Int,
) -> Array[Delivery] {
  guard hubs.get(id) is Some(hub) else {
    return [reject(connection, "unknown hub")]
  }
  if user <= 0 ||
    room_id <= 0 ||
    connection <= 0 ||
    hub.peers.contains(connection) {
    return [reject(connection, "invalid join")]
  }
  match hub.rooms.get(room_id) {
    None => {
      hub.peers[connection] = { user, room: room_id, }
      hub.rooms[room_id] = Waiting(connection)
      [send(connection, { "type": "waiting" })]
    }
    Some(Paired(_)) => [reject(connection, "room already occupied")]
    Some(Waiting(first)) => {
      if hub.peers[first].user == user {
        return [reject(connection, "room already occupied")]
      }
      let offerer = if hub.peers[first].user > user {
        first
      } else {
        connection
      }
      hub.peers[connection] = { user, room: room_id, }
      hub.rooms[room_id] = Paired({
        first,
        second: connection,
        offerer,
        phase: Ready,
      })
      [
        send(first, {
          "type": "callType",
          "isOffer": (first == offerer).to_json(),
        }),
        send(connection, {
          "type": "callType",
          "isOffer": (connection == offerer).to_json(),
        }),
      ]
    }
  }
}

///|
pub fn leave(id : Int, connection : Int) -> Array[Delivery] {
  guard hubs.get(id) is Some(hub) else { return [] }
  guard hub.peers.get(connection) is Some(peer) else { return [] }
  hub.peers.remove(connection)
  match hub.rooms.get(peer.room) {
    None => []
    Some(Waiting(_)) => {
      hub.rooms.remove(peer.room)
      []
    }
    Some(Paired(pair)) => {
      let other = if pair.first == connection {
        pair.second
      } else {
        pair.first
      }
      hub.rooms[peer.room] = Waiting(other)
      [send(other, { "type": "peer-left" })]
    }
  }
}

///|
fn relay_parsed(
  id : Int,
  connection : Int,
  text : String,
  signal : @shared.ClientSignal?,
) -> Array[Delivery] {
  guard hubs.get(id) is Some(hub) else {
    return [reject(connection, "unknown hub")]
  }
  guard hub.peers.get(connection) is Some(peer) else {
    return [reject(connection, "authentication required")]
  }
  guard hub.rooms.get(peer.room) is Some(room) else {
    return [reject(connection, "room missing")]
  }
  guard room is Paired(pair) else {
    return [reject(connection, "peer not ready")]
  }
  guard signal is Some(Peer(message)) else {
    return [reject(connection, "invalid signal")]
  }
  match (pair.phase, pair.role(connection), message) {
    (Ready, Offerer, Offer(_)) => pair.phase = OfferSent
    (OfferSent, Answerer, Answer(_)) => pair.phase = Negotiated(Neither)
    (_, _, Ice(_)) => ()
    (_, _, Offer(_)) => return [reject(connection, "unexpected offer")]
    (_, _, Answer(_)) => return [reject(connection, "unexpected answer")]
  }
  let other = if pair.first == connection { pair.second } else { pair.first }
  // Relay the original bytes after validation. No decode/encode copy of SDP.
  [{ connection: other, payload: text, close_code: 0, }]
}

///|
pub fn relay(id : Int, connection : Int, text : String) -> Array[Delivery] {
  relay_parsed(id, connection, text, @shared.parse_client_signal(text))
}

///|
pub(all) struct Reception {
  deliveries : Array[Delivery]
  media_ready : Bool
}

///|
pub fn receive(id : Int, connection : Int, text : String) -> Reception {
  let signal = @shared.parse_client_signal(text)
  match signal {
    Some(MediaReady) =>
      { deliveries: [], media_ready: confirm_media(id, connection), }
    _ =>
      {
        deliveries: relay_parsed(id, connection, text, signal),
        media_ready: false,
      }
  }
}

///|
/// Only the second distinct acknowledgement triggers a durable begin command.
pub fn confirm_media(id : Int, connection : Int) -> Bool {
  guard hubs.get(id) is Some(hub) else { return false }
  guard hub.peers.get(connection) is Some(peer) else { return false }
  guard hub.rooms.get(peer.room) is Some(Paired(pair)) else { return false }
  let role = pair.role(connection)
  match (pair.phase, role) {
    (Negotiated(Neither), _) => {
      pair.phase = Negotiated(One(role))
      false
    }
    (Negotiated(One(Offerer)), Answerer)
    | (Negotiated(One(Answerer)), Offerer) => {
      pair.phase = Negotiated(Both)
      true
    }
    _ => false
  }
}

///|
pub fn publish(
  id : Int,
  room_id : Int,
  payload : String,
  completed : Bool,
) -> Array[Delivery] {
  guard hubs.get(id) is Some(hub) else { return [] }
  guard hub.rooms.get(room_id) is Some(room) else { return [] }
  let connections = room.connections()
  let messages = connections.map(fn(c) {
    { connection: c, payload, close_code: if completed { 1000 } else { 0 }, }
  })
  if completed {
    for c in connections {
      hub.peers.remove(c)
    }
    hub.rooms.remove(room_id)
  }
  messages
}
