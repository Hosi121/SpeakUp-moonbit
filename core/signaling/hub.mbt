///|
/// Only verified room members may enter this state machine.
priv struct Peer {
  user : Int
  room : Int
}

///|
priv struct Room {
  peers : Array[Int]
  mut phase : Int
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
  let room = hub.rooms.get_or_init(room_id, fn() { { peers: [], phase: 0, } })
  if room.peers.length() >= 2 ||
    room.peers.any(fn(c) { hub.peers[c].user == user }) {
    return [reject(connection, "room already occupied")]
  }
  hub.peers[connection] = { user, room: room_id, }
  room.peers.push(connection)
  if room.peers.length() == 1 {
    return [send(connection, { "type": "waiting" })]
  }
  let a = room.peers[0]
  let b = room.peers[1]
  room.phase = 1
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
  room.phase = 0
  if room.peers.is_empty() {
    hub.rooms.remove(peer.room)
    return []
  }
  room.peers.map(fn(c) { send(c, { "type": "peer-left" }) })
}

///|
pub fn relay(id : Int, connection : Int, text : String) -> Array[Delivery] {
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
  let signal = @shared.parse_signal(text)
  match signal.kind {
    "offer" => {
      if !is_offer || room.phase != 1 {
        return [reject(connection, "unexpected offer")]
      }
      room.phase = 2
    }
    "answer" => {
      if is_offer || room.phase != 2 {
        return [reject(connection, "unexpected answer")]
      }
      room.phase = 3
    }
    "ice-candidate" =>
      if room.phase < 1 {
        return [reject(connection, "unexpected ICE")]
      }
    _ => return [reject(connection, "invalid signal")]
  }
  // Relay the original bytes after validation. No decode/encode copy of SDP.
  [{ connection: other, payload: text, close_code: 0, }]
}
