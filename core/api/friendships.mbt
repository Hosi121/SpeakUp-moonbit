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
fn friend_record(value : Json, low : Int, high : Int) -> FriendRecord raise {
  guard value is Array(values) else { raise Upstream("invalid friendship row") }
  if values.is_empty() {
    return { state: Absent, revision: 0, }
  }
  guard values is [row] else { raise Upstream("invalid friendship row") }
  let requester = number(row, "requested_by")
  let side : @friendship.Member = if requester == low {
    First
  } else if requester == high {
    Second
  } else {
    raise Upstream("invalid friendship requester")
  }
  let state : @friendship.State = match string(row, "status") {
    "PENDING" => Pending(side)
    "FRIEND" => Accepted(side)
    "DECLINED" => Declined(side)
    "BLOCKED" => Blocked
    _ => raise Upstream("invalid friendship status")
  }
  { state, revision: number(row, "revision"), }
}

///|
let friend_select : String = "SELECT status,requested_by,revision FROM friendships WHERE low_user_id=? AND high_user_id=?"

///|
/// Compare-and-set and the notification share a transaction. If another
/// command wins, re-read and let the same domain policy decide again.
async fn apply_friendship(
  uid : Int,
  target : Int,
  action : @friendship.Action,
) -> Unit {
  let low = if uid < target { uid } else { target }
  let high = if uid < target { target } else { uid }
  let actor : @friendship.Member = if uid == low { First } else { Second }
  let pair = [low.to_json(), high.to_json()]
  for _ in 0..<4 {
    let before = friend_record(query(friend_select, pair), low, high)
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
      Absent | Blocked => raise Upstream("invalid friendship decision")
    }
    let requested_by = match requester {
      First => low
      Second => high
    }
    if changed && before.revision == 2147483647 {
      raise Upstream("friendship revision overflow")
    }
    let revision = before.revision + (if changed { 1 } else { 0 })
    let statements : Array[Json] = []
    if changed {
      match before.state {
        // The duplicate-key no-op acquires an exclusive lock as well. INSERT
        // IGNORE would allow competing shared locks to deadlock on upgrade.
        Absent =>
          statements.push({
            "sql": "INSERT INTO friendships(low_user_id,high_user_id,requested_by,status,revision) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE revision=revision",
            "params": [
              low.to_json(),
              high.to_json(),
              requested_by.to_json(),
              status.to_json(),
            ],
          })
        Pending(_) | Accepted(_) | Declined(_) | Blocked =>
          statements.push({
            "sql": "UPDATE friendships SET status=?,requested_by=?,revision=revision+1,updated_at=UTC_TIMESTAMP() WHERE low_user_id=? AND high_user_id=? AND revision=?",
            "params": [
              status.to_json(),
              requested_by.to_json(),
              low.to_json(),
              high.to_json(),
              before.revision.to_json(),
            ],
          })
      }
    } else {
      statements.push({
        "sql": (friend_select + " FOR UPDATE").to_json(),
        "params": pair.to_json(),
      })
    }
    if decision.notice is Some(notice) {
      let kind = match notice {
        Requested => "friend_request"
        Accepted => "friend_accepted"
      }
      statements.push({
        "sql": "INSERT IGNORE INTO notifications(user_id,actor_id,event_key,kind) SELECT ?,?,CONCAT('friend:',low_user_id,':',high_user_id,':',revision),? FROM friendships WHERE low_user_id=? AND high_user_id=? AND revision=? AND status=? AND requested_by=?",
        "params": [
          target.to_json(),
          uid.to_json(),
          kind.to_json(),
          low.to_json(),
          high.to_json(),
          revision.to_json(),
          status.to_json(),
          requested_by.to_json(),
        ],
      })
    }
    // A locking read sees the row serialized by the preceding write/lock,
    // including when a competing identical command already applied it.
    statements.push({
      "sql": (friend_select + " FOR UPDATE").to_json(),
      "params": pair.to_json(),
    })
    let saved = friend_record(
      invoke({ "operation": "transaction", "statements": statements.to_json() }),
      low,
      high,
    )
    if saved.state == decision.next && saved.revision == revision {
      return
    }
  }
  raise Invalid(409, "This request can no longer be changed")
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
  apply_friendship(uid, target, friendship_action(action))
  notify_user(uid)
  notify_user(target)
  social(uid)
}
