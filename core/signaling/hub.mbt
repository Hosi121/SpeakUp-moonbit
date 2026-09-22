///|
/// Only verified room members may enter this state machine.
priv struct Peer {
  user : Int
  room : Int
  mut media_ready : Bool
}

///|
priv enum Negotiation {
  AwaitingPeer
  Ready
  OfferSent
  Negotiated
} derive(Eq)

///|
priv struct Room {
  peers : Array[Int]
  mut phase : Negotiation
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
  let room = hub.rooms.get_or_init(room_id, fn() {
    { peers: [], phase: AwaitingPeer, }
  })
  if room.peers.length() >= 2 ||
    room.peers.any(fn(c) { hub.peers[c].user == user }) {
    return [reject(connection, "room already occupied")]
  }
  hub.peers[connection] = { user, room: room_id, media_ready: false, }
  room.peers.push(connection)
  if room.peers.length() == 1 {
    return [send(connection, { "type": "waiting" })]
  }
  let a = room.peers[0]
  let b = room.peers[1]
  room.phase = Ready
  [
    send(a, {
      "type": "callType",
      "isOffer": (hub.peers[a].user > hub.peers[b].user).to_json(),
    }),
    send(b, {
      "type": "callType",
      "isOffer": (hub.peers[b].user > hub.peers[a].user).to_json(),
    }),
  ]
}

///|
pub fn leave(id : Int, connection : Int) -> Array[Delivery] {
  guard hubs.get(id) is Some(hub) else { return [] }
  guard hub.peers.get(connection) is Some(peer) else { return [] }
  hub.peers.remove(connection)
  guard hub.rooms.get(peer.room) is Some(room) else { return [] }
  room.peers.retain(fn(c) { c != connection })
  room.phase = AwaitingPeer
  for c in room.peers {
    hub.peers[c].media_ready = false
  }
  if room.peers.is_empty() {
    hub.rooms.remove(peer.room)
    return []
  }
  room.peers.map(fn(c) { send(c, { "type": "peer-left" }) })
}

///|
fn relay_parsed(
  id : Int,
  connection : Int,
  text : String,
  signal : @shared.ParsedSignal,
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
  if room.peers.length() != 2 {
    return [reject(connection, "peer not ready")]
  }
  let other = if room.peers[0] == connection {
    room.peers[1]
  } else {
    room.peers[0]
  }
  let is_offer = peer.user > hub.peers[other].user
  match signal.kind {
    "offer" => {
      if !is_offer || room.phase != Ready {
        return [reject(connection, "unexpected offer")]
      }
      room.phase = OfferSent
    }
    "answer" => {
      if is_offer || room.phase != OfferSent {
        return [reject(connection, "unexpected answer")]
      }
      room.phase = Negotiated
    }
    "ice-candidate" =>
      if room.phase == AwaitingPeer {
        return [reject(connection, "unexpected ICE")]
      }
    _ => return [reject(connection, "invalid signal")]
  }
  // Relay the original bytes after validation. No decode/encode copy of SDP.
  [{ connection: other, payload: text, close_code: 0, }]
}

///|
pub fn relay(id : Int, connection : Int, text : String) -> Array[Delivery] {
  relay_parsed(id, connection, text, @shared.validate_signal(text))
}

///|
pub(all) struct Reception {
  deliveries : Array[Delivery]
  media_ready : Bool
}

///|
pub fn receive(id : Int, connection : Int, text : String) -> Reception {
  let signal = @shared.validate_signal(text)
  if signal.kind == "media-ready" {
    { deliveries: [], media_ready: confirm_media(id, connection), }
  } else {
    {
      deliveries: relay_parsed(id, connection, text, signal),
      media_ready: false,
    }
  }
}

///|
/// Only the second distinct acknowledgement triggers a durable begin command.
/// These acknowledgements belong to this negotiation, not to a DB attendance row.
pub fn confirm_media(id : Int, connection : Int) -> Bool {
  guard hubs.get(id) is Some(hub) else { return false }
  guard hub.peers.get(connection) is Some(peer) else { return false }
  guard hub.rooms.get(peer.room) is Some(room) else { return false }
  if room.phase != Negotiated || peer.media_ready {
    return false
  }
  peer.media_ready = true
  room.peers.all(fn(c) { hub.peers[c].media_ready })
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
  let messages = room.peers.map(fn(c) {
    { connection: c, payload, close_code: if completed { 1000 } else { 0 }, }
  })
  if completed {
    for c in room.peers {
      hub.peers.remove(c)
    }
    hub.rooms.remove(room_id)
  }
  messages
}
