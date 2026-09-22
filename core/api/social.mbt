///|
let activity_listener : Ref[(Int) -> Unit] = { val: fn(_) { () }, }

///|
pub fn set_notifier(listener : (Int) -> Unit) -> Unit {
  activity_listener.val = listener
}

///|
fn notify_user(uid : Int) -> Unit {
  (activity_listener.val)(uid)
}

///|
fn friend_dto(v : Json) -> @shared.FriendSummaryDto raise {
  let dto : @shared.FriendSummaryDto = @json.from_json(v)
  { ..dto, avatar_url: (host().public_url)(dto.avatar_url), }
}

///|
async fn social(uid : Int) -> @shared.SocialDto {
  let friends = []
  let incoming = []
  let outgoing = []
  let result = rows(
    "SELECT u.id,u.username,u.avatar_url,f.status,f.requested_by FROM friendships f JOIN users u ON u.id=IF(f.low_user_id=?,f.high_user_id,f.low_user_id) WHERE (f.low_user_id=? OR f.high_user_id=?) AND u.is_deleted=0 AND f.status IN ('FRIEND','PENDING') ORDER BY u.id",
    [uid.to_json(), uid.to_json(), uid.to_json()],
  )
  for row in result {
    let other = friend_dto(row)
    if string(row, "status") == "FRIEND" {
      friends.push(other)
    } else if number(row, "requested_by") == uid {
      outgoing.push(other)
    } else {
      incoming.push(other)
    }
  }
  { friends, incoming, outgoing, }
}

///|
async fn friendship(
  uid : Int,
  target : Int,
  action : String,
) -> @shared.SocialDto {
  if target == uid {
    raise Invalid(400, "Choose another user")
  }
  one("SELECT id FROM users WHERE id=? AND is_deleted=0", [target.to_json()])
  |> ignore
  let low = if uid < target { uid } else { target }
  let high = if uid < target { target } else { uid }
  let pair = [low.to_json(), high.to_json()]
  let statements : Array[Json] = []
  if action == "request" {
    statements.push({
      "sql": "INSERT INTO friendships(low_user_id,high_user_id,requested_by,status) VALUES (?,?,?,'PENDING') ON DUPLICATE KEY UPDATE revision=IF(status='DECLINED',revision+1,revision),requested_by=IF(status='DECLINED',VALUES(requested_by),requested_by),status=IF(status='DECLINED','PENDING',status)",
      "params": [low.to_json(), high.to_json(), uid.to_json()],
    })
  } else {
    statements.push({
      "sql": "SELECT status FROM friendships WHERE low_user_id=? AND high_user_id=? FOR UPDATE",
      "params": pair.to_json(),
    })
    let accept = action == "accept"
    if !accept && action != "reject" && action != "cancel" {
      raise Invalid(400, "Invalid friendship action")
    }
    let condition = if action == "cancel" { "=" } else { "<>" }
    statements.push({
      "sql": ("UPDATE friendships SET status=?,revision=revision+1,updated_at=UTC_TIMESTAMP() WHERE low_user_id=? AND high_user_id=? AND status='PENDING' AND requested_by" +
      condition +
      "?").to_json(),
      "params": [
        (if accept { "FRIEND" } else { "DECLINED" }).to_json(),
        low.to_json(),
        high.to_json(),
        uid.to_json(),
      ],
    })
  }
  if action == "request" || action == "accept" {
    statements.push({
      "sql": "INSERT IGNORE INTO notifications(user_id,actor_id,event_key,kind) SELECT ?,?,CONCAT('friend:',low_user_id,':',high_user_id,':',revision),? FROM friendships WHERE low_user_id=? AND high_user_id=? AND status=? AND requested_by=?",
      "params": [
        target.to_json(),
        uid.to_json(),
        (if action == "request" { "friend_request" } else { "friend_accepted" }).to_json(),
        low.to_json(),
        high.to_json(),
        (if action == "request" { "PENDING" } else { "FRIEND" }).to_json(),
        (if action == "request" { uid } else { target }).to_json(),
      ],
    })
  }
  statements.push({
    "sql": "SELECT status,requested_by FROM friendships WHERE low_user_id=? AND high_user_id=?",
    "params": pair.to_json(),
  })
  let result = invoke({
    "operation": "transaction",
    "statements": statements.to_json(),
  })
  guard result is Array([row]) else { raise Invalid(409, "No pending request") }
  let status = string(row, "status")
  let requester = number(row, "requested_by")
  let valid = match action {
    "request" => status == "FRIEND" || (status == "PENDING" && requester == uid)
    "accept" => status == "FRIEND" && requester == target
    "cancel" => status == "DECLINED" && requester == uid
    _ => status == "DECLINED" && requester == target
  }
  if !valid {
    raise Invalid(409, "This request can no longer be changed")
  }
  notify_user(uid)
  notify_user(target)
  social(uid)
}

///|
async fn inbox(uid : Int) -> @shared.InboxDto {
  let items = rows(
    "SELECT n.id,n.kind,n.conversation_id,n.message_id,n.read_at,n.created_at,u.id AS actor_id,u.username,u.avatar_url FROM notifications n JOIN users u ON u.id=n.actor_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 100",
    [uid.to_json()],
  ).map(fn(v) raise {
    @shared.NotificationDto::{
      id: number(v, "id"),
      kind: string(v, "kind"),
      actor: {
        id: number(v, "actor_id"),
        username: string(v, "username"),
        avatar_url: (host().public_url)(string(v, "avatar_url")),
      },
      conversation_id: if field(v, "conversation_id") == Json::null() {
        0
      } else {
        number(v, "conversation_id")
      },
      message_id: if field(v, "message_id") == Json::null() {
        0
      } else {
        number(v, "message_id")
      },
      read: field(v, "read_at") != Json::null(),
      created_at: iso(string(v, "created_at")),
    }
  })
  let count = one(
    "SELECT COUNT(*) AS unread FROM notifications WHERE user_id=? AND read_at IS NULL",
    [uid.to_json()],
  )
  {
    items,
    unread: @json.from_json(field(count, "unread")),
    now: (host().now_millis)(),
  }
}

///|
async fn require_friend(uid : Int, target : Int) -> @shared.FriendSummaryDto {
  friend_dto(
    one(
      "SELECT u.id,u.username,u.avatar_url FROM friendships f JOIN users u ON u.id=? WHERE f.low_user_id=LEAST(?,?) AND f.high_user_id=GREATEST(?,?) AND f.status='FRIEND' AND u.is_deleted=0",
      [
        target.to_json(),
        uid.to_json(),
        target.to_json(),
        uid.to_json(),
        target.to_json(),
      ],
    ),
  )
}

///|
async fn thread(uid : Int, target : Int, before : Int) -> @shared.ThreadDto {
  let peer = require_friend(uid, target)
  let messages = rows(
    "SELECT id,sender_id,recipient_id,body,created_at,COALESCE(read_at,'') AS read_at FROM direct_messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND (?=0 OR id<?) ORDER BY id DESC LIMIT 51",
    [
      uid.to_json(),
      target.to_json(),
      target.to_json(),
      uid.to_json(),
      before.to_json(),
      before.to_json(),
    ],
  ).map(fn(v) raise {
    let dto : @shared.MessageDto = @json.from_json(v)
    { ..dto, created_at: iso(dto.created_at), read_at: iso(dto.read_at), }
  })
  let has_older = messages.length() > 50
  if has_older {
    messages.pop() |> ignore
  }
  { peer, messages: messages.rev(), has_older, }
}

///|
fn request_key(body : Json) -> String raise {
  let id = required(body, "request_id", 64)
  if id.length() < 16 ||
    !id
    .iter()
    .all(fn(c) {
      (c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') ||
      c == '-'
    }) {
    raise Invalid(400, "Invalid request ID")
  }
  id
}

///|
async fn send_message(
  uid : Int,
  target : Int,
  body : Json,
) -> @shared.ThreadDto {
  require_friend(uid, target) |> ignore
  let content = required(body, "body", 2000)
  if content.trim().is_empty() {
    raise Invalid(400, "Message is empty")
  }
  let key = request_key(body)
  // Unique sender/request key makes retries safe. A key cannot address another peer or body.
  invoke({
    "operation": "transaction",
    "statements": [
      {
        "sql": "INSERT INTO direct_messages(sender_id,recipient_id,request_id,body) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE id=id",
        "params": [
          uid.to_json(),
          target.to_json(),
          key.to_json(),
          content.to_json(),
        ],
      },
      {
        "sql": "INSERT IGNORE INTO notifications(user_id,actor_id,event_key,kind,message_id) SELECT recipient_id,sender_id,CONCAT('message:',id),'message',id FROM direct_messages WHERE sender_id=? AND request_id=? AND recipient_id=? AND BINARY body=BINARY ?",
        "params": [
          uid.to_json(),
          key.to_json(),
          target.to_json(),
          content.to_json(),
        ],
      },
    ],
  })
  |> ignore
  let saved = one(
    "SELECT recipient_id,body FROM direct_messages WHERE sender_id=? AND request_id=?",
    [uid.to_json(), key.to_json()],
  )
  if number(saved, "recipient_id") != target || string(saved, "body") != content {
    raise Invalid(409, "Request ID already used")
  }
  notify_user(target)
  notify_user(uid)
  thread(uid, target, 0)
}
