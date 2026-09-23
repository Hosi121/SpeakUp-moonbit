///|
fn Api::notify_user(self : Self, uid : @identity.UserId) -> Unit {
  (self.notify)(uid)
}

///|
fn Api::friend_dto(self : Self, v : DbRow) -> @shared.FriendSummaryDto raise {
  let dto : @shared.FriendSummaryDto = v.decode()
  { ..dto, avatar_url: (self.host.public_url)(dto.avatar_url), }
}

///|
async fn Api::social(self : Self, uid : @identity.UserId) -> @shared.SocialDto {
  let friends = []
  let incoming = []
  let outgoing = []
  let result = self.rows(
    "SELECT u.id,u.username,u.avatar_url,f.status,f.requested_by FROM friendships f JOIN users u ON u.id=IF(f.low_user_id=?,f.high_user_id,f.low_user_id) WHERE (f.low_user_id=? OR f.high_user_id=?) AND u.is_deleted=0 AND f.status IN ('FRIEND','PENDING') ORDER BY u.id",
    [uid.to_sql(), uid.to_sql(), uid.to_sql()],
  )
  for row in result {
    let other = self.friend_dto(row)
    if row.text("status") == "FRIEND" {
      friends.push(other)
    } else if row.user_id("requested_by") == uid {
      outgoing.push(other)
    } else {
      incoming.push(other)
    }
  }
  { friends, incoming, outgoing, }
}

///|
async fn Api::inbox(self : Self, uid : @identity.UserId) -> @shared.InboxDto {
  // One statement keeps the unread count and the displayed read watermark in
  // the same snapshot, even when a notification is inserted concurrently.
  let result = self.rows(
    "SELECT n.id,n.kind,n.conversation_id,n.message_id,n.read_at,n.created_at,u.id AS actor_id,u.username,u.avatar_url,(SELECT COUNT(*) FROM notifications WHERE user_id=? AND read_at IS NULL) AS unread FROM notifications n JOIN users u ON u.id=n.actor_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 100",
    [uid.to_sql(), uid.to_sql()],
  )
  let items = result.map(fn(v) raise {
    let dto = @shared.NotificationDto::{
      id: v.id("id"),
      kind: v.text("kind"),
      actor: {
        id: v.id("actor_id"),
        username: v.text("username"),
        avatar_url: (self.host.public_url)(v.text("avatar_url")),
      },
      conversation_id: if v.field("conversation_id") is Null {
        0
      } else {
        v.id("conversation_id")
      },
      message_id: if v.field("message_id") is Null {
        0
      } else {
        v.id("message_id")
      },
      read: !(v.field("read_at") is Null),
      created_at: iso(v.text("created_at")),
    }
    dto.notice() |> ignore
    dto
  })
  {
    items,
    unread: if result.is_empty() {
      0
    } else {
      result[0].int("unread")
    },
    now: (self.host.now_millis)(),
  }
}

///|
async fn Api::require_friend(
  self : Self,
  uid : @identity.UserId,
  target : @identity.UserId,
) -> @shared.FriendSummaryDto {
  self.friend_dto(
    self.one(
      "SELECT u.id,u.username,u.avatar_url FROM friendships f JOIN users u ON u.id=? WHERE f.low_user_id=LEAST(?,?) AND f.high_user_id=GREATEST(?,?) AND f.status='FRIEND' AND u.is_deleted=0",
      [
        target.to_sql(),
        uid.to_sql(),
        target.to_sql(),
        uid.to_sql(),
        target.to_sql(),
      ],
    ),
  )
}

///|
async fn Api::thread(
  self : Self,
  uid : @identity.UserId,
  target : @identity.UserId,
  before : Int,
) -> @shared.ThreadDto {
  let peer = self.require_friend(uid, target)
  let messages = self
    .rows(
      "SELECT id,sender_id,recipient_id,body,created_at,COALESCE(read_at,'') AS read_at FROM direct_messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND (?=0 OR id<?) ORDER BY id DESC LIMIT 51",
      [
        uid.to_sql(),
        target.to_sql(),
        target.to_sql(),
        uid.to_sql(),
        before.to_sql(),
        before.to_sql(),
      ],
    )
    .map(fn(v) raise {
      let dto : @shared.MessageDto = v.decode()
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
async fn Api::send_message(
  self : Self,
  uid : @identity.UserId,
  target : @identity.UserId,
  body : Json,
) -> @shared.ThreadDto {
  self.require_friend(uid, target) |> ignore
  let content = required(body, "body", 2000)
  if content.trim().is_empty() {
    raise Invalid(400, "Message is empty")
  }
  let key = request_key(body)
  // Unique sender/request key makes retries safe. A key cannot address another peer or body.
  self.transaction([
    {
      sql: "INSERT INTO direct_messages(sender_id,recipient_id,request_id,body) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE id=id",
      params: [uid.to_sql(), target.to_sql(), key.to_sql(), content.to_sql()],
    },
    {
      sql: "INSERT IGNORE INTO notifications(user_id,actor_id,event_key,kind,message_id) SELECT recipient_id,sender_id,CONCAT('message:',id),'message',id FROM direct_messages WHERE sender_id=? AND request_id=? AND recipient_id=? AND BINARY body=BINARY ?",
      params: [uid.to_sql(), key.to_sql(), target.to_sql(), content.to_sql()],
    },
  ])
  |> ignore
  let saved = self.one(
    "SELECT recipient_id,body FROM direct_messages WHERE sender_id=? AND request_id=?",
    [uid.to_sql(), key.to_sql()],
  )
  if saved.user_id("recipient_id") != target || saved.text("body") != content {
    raise Invalid(409, "Request ID already used")
  }
  self.notify_user(target)
  self.notify_user(uid)
  self.thread(uid, target, 0)
}
