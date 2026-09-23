///|
priv struct FriendRecord {
  state : @friendship.State
  revision : Int
}

///|
fn friendship_action(value : String) -> @friendship.Action raise ApiError {
  match @friendship.Action::parse(value) {
    Some(action) => action
    None => raise Invalid(400, "Invalid friendship action")
  }
}

///|
/// SQL/JSON is a repository boundary, never the policy's input type.
fn friend_record(
  values : Array[DbRow],
  low : @identity.UserId,
  high : @identity.UserId,
) -> FriendRecord raise {
  if values.is_empty() {
    return { state: Absent, revision: 0, }
  }
  guard values is [row] else { raise HostError::InvalidData }
  let requester = row.user_id("requested_by")
  let side : @friendship.Member = if requester == low {
    First
  } else if requester == high {
    Second
  } else {
    raise HostError::InvalidData
  }
  let state : @friendship.State = match row.text("status") {
    "PENDING" => Pending(side)
    "FRIEND" => Accepted(side)
    "DECLINED" => Declined(side)
    "BLOCKED" => Blocked
    _ => raise HostError::InvalidData
  }
  { state, revision: row.id("revision"), }
}

///|
let friend_select : String = "SELECT status,requested_by,revision FROM friendships WHERE low_user_id=? AND high_user_id=?"

///|
/// Compare-and-set and the notification share a transaction. If another
/// command wins, re-read and let the same domain policy decide again.
async fn Api::apply_friendship(
  self : Self,
  uid : @identity.UserId,
  target : @identity.UserId,
  action : @friendship.Action,
) -> Unit {
  let low = if uid < target { uid } else { target }
  let high = if uid < target { target } else { uid }
  let actor : @friendship.Member = if uid == low { First } else { Second }
  let pair = [low.to_sql(), high.to_sql()]
  for _ in 0..<4 {
    let before = friend_record(self.rows(friend_select, pair), low, high)
    let decision = @friendship.decide(before.state, action, actor) catch {
      @friendship.NoPending => raise Invalid(409, "No pending request")
      @friendship.Conflict =>
        raise Invalid(409, "This request can no longer be changed")
    }
    let changed = decision.next != before.state
    if !changed && decision.notice is None {
      return
    }
    let (status, requester) = match decision.next {
      Pending(side) => ("PENDING", side)
      Accepted(side) => ("FRIEND", side)
      Declined(side) => ("DECLINED", side)
      Absent | Blocked => raise HostError::InvalidData
    }
    let requested_by = match requester {
      First => low
      Second => high
    }
    if changed && before.revision == 2147483647 {
      raise HostError::InvalidData
    }
    let revision = before.revision + (if changed { 1 } else { 0 })
    let statements : Array[Statement] = []
    if changed {
      match before.state {
        // The duplicate-key no-op acquires an exclusive lock as well. INSERT
        // IGNORE would allow competing shared locks to deadlock on upgrade.
        Absent =>
          statements.push({
            sql: "INSERT INTO friendships(low_user_id,high_user_id,requested_by,status,revision) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE revision=revision",
            params: [
              low.to_sql(),
              high.to_sql(),
              requested_by.to_sql(),
              status.to_sql(),
            ],
          })
        Pending(_) | Accepted(_) | Declined(_) | Blocked =>
          statements.push({
            sql: "UPDATE friendships SET status=?,requested_by=?,revision=revision+1,updated_at=UTC_TIMESTAMP() WHERE low_user_id=? AND high_user_id=? AND revision=?",
            params: [
              status.to_sql(),
              requested_by.to_sql(),
              low.to_sql(),
              high.to_sql(),
              before.revision.to_sql(),
            ],
          })
      }
    } else {
      statements.push({ sql: friend_select + " FOR UPDATE", params: pair, })
    }
    if decision.notice is Some(notice) {
      let kind = match notice {
        Requested => "friend_request"
        Accepted => "friend_accepted"
      }
      statements.push({
        sql: "INSERT IGNORE INTO notifications(user_id,actor_id,event_key,kind) SELECT ?,?,CONCAT('friend:',low_user_id,':',high_user_id,':',revision),? FROM friendships WHERE low_user_id=? AND high_user_id=? AND revision=? AND status=? AND requested_by=?",
        params: [
          target.to_sql(),
          uid.to_sql(),
          kind.to_sql(),
          low.to_sql(),
          high.to_sql(),
          revision.to_sql(),
          status.to_sql(),
          requested_by.to_sql(),
        ],
      })
    }
    // A locking read sees the row serialized by the preceding write/lock,
    // including when a competing identical command already applied it.
    statements.push({ sql: friend_select + " FOR UPDATE", params: pair, })
    let saved = friend_record(self.transaction(statements).rows(), low, high)
    if saved.state == decision.next && saved.revision == revision {
      return
    }
  }
  raise Invalid(409, "This request can no longer be changed")
}

///|
async fn Api::friendship(
  self : Self,
  uid : @identity.UserId,
  target : @identity.UserId,
  action : String,
) -> @shared.SocialDto {
  if target == uid {
    raise Invalid(400, "Choose another user")
  }
  self.one("SELECT id FROM users WHERE id=? AND is_deleted=0", [target.to_sql()])
  |> ignore
  self.apply_friendship(uid, target, friendship_action(action))
  self.notify_user(uid)
  self.notify_user(target)
  self.social(uid)
}
