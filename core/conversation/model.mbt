///|
/// Storage/wire values are validated before becoming a domain value.
pub(all) struct Snapshot {
  id : Int
  first : Int
  second : Int
  started_at : Double
  ended_at : Double
  cancelled_at : Double
  revision : Int
} derive(ToJson, FromJson)

///|
priv enum Phase {
  Planned
  Active(Double)
  Completed
  Cancelled
}

///|
priv struct Conversation {
  snapshot : Snapshot
  phase : Phase
}

///|
pub suberror StateError {
  InvalidSnapshot
  NotParticipant
  NotStarted
  AlreadyCompleted
  AlreadyStarted
  InvalidClock
} derive(Eq, Debug)

///|
fn valid_time(time : Double) -> Bool {
  time >= 0 && @wire.is_safe_integer(time)
}

///|
fn restore(s : Snapshot) -> Conversation raise StateError {
  guard s.id > 0 &&
    s.first > 0 &&
    s.second > s.first &&
    s.revision >= 0 &&
    s.revision <= 2 &&
    valid_time(s.started_at) &&
    valid_time(s.ended_at) &&
    valid_time(s.cancelled_at) else {
    raise InvalidSnapshot
  }
  let phase = if s.cancelled_at > 0 {
    if s.started_at != 0 || s.ended_at != 0 {
      raise InvalidSnapshot
    }
    Cancelled
  } else if s.started_at == 0 {
    if s.ended_at != 0 {
      raise InvalidSnapshot
    }
    Planned
  } else if s.ended_at == 0 {
    Active(s.started_at)
  } else {
    if s.ended_at < s.started_at {
      raise InvalidSnapshot
    }
    Completed
  }
  let expected_revision = match phase {
    Planned => 0
    Active(_) | Cancelled => 1
    Completed => 2
  }
  guard s.revision == expected_revision else { raise InvalidSnapshot }
  { snapshot: s, phase, }
}

///|
fn authorize(c : Conversation, actor : Int) -> Unit raise StateError {
  if actor != c.snapshot.first && actor != c.snapshot.second {
    raise NotParticipant
  }
}

///|
pub fn begin(
  s : Snapshot,
  actor : Int,
  now : Double,
) -> Snapshot raise StateError {
  let c = restore(s)
  authorize(c, actor)
  guard valid_time(now) && now > 0 else { raise InvalidClock }
  match c.phase {
    Planned => { ..s, started_at: now, revision: s.revision + 1, }
    Active(_) => s
    Completed | Cancelled => raise AlreadyCompleted
  }
}

///|
pub fn finish(
  s : Snapshot,
  actor : Int,
  now : Double,
) -> Snapshot raise StateError {
  let c = restore(s)
  authorize(c, actor)
  guard valid_time(now) && now > 0 else { raise InvalidClock }
  match c.phase {
    Planned => raise NotStarted
    Active(start) =>
      {
        ..s,
        ended_at: if now < start {
          start
        } else {
          now
        },
        revision: s.revision + 1,
      }
    Completed => s
    Cancelled => raise AlreadyCompleted
  }
}

///|
pub fn cancel(
  s : Snapshot,
  actor : Int,
  now : Double,
) -> Snapshot raise StateError {
  let c = restore(s)
  authorize(c, actor)
  guard valid_time(now) && now > 0 else { raise InvalidClock }
  match c.phase {
    Planned => { ..s, cancelled_at: now, revision: s.revision + 1, }
    Cancelled => s
    Active(_) => raise AlreadyStarted
    Completed => raise AlreadyCompleted
  }
}

///|
pub fn state(s : Snapshot) -> String raise StateError {
  match restore(s).phase {
    Planned => "planned"
    Active(_) => "active"
    Completed => "completed"
    Cancelled => "cancelled"
  }
}

///|
pub fn partner(s : Snapshot, actor : Int) -> Int raise StateError {
  let c = restore(s)
  authorize(c, actor)
  if actor == s.first {
    s.second
  } else {
    s.first
  }
}

///|
pub fn remaining(
  s : Snapshot,
  now : Double,
  duration_seconds : Int,
) -> Int raise StateError {
  let c = restore(s)
  guard valid_time(now) && duration_seconds >= 0 else { raise InvalidClock }
  match c.phase {
    Planned => if duration_seconds == 0 { -1 } else { duration_seconds }
    Completed | Cancelled => 0
    Active(start) => {
      if duration_seconds == 0 {
        return -1
      }
      let elapsed = (now - start) / 1000.0
      if elapsed <= 0 {
        duration_seconds
      } else if elapsed >= duration_seconds.to_double() {
        0
      } else {
        duration_seconds - elapsed.to_int()
      }
    }
  }
}

///|
pub extend Snapshot with ToJson::{to_json}

///|
pub extend Snapshot with @json.FromJson::{from_json}

///|
pub extend StateError with Eq::{equal, not_equal}

///|
pub extend StateError with @debug.Debug::{to_repr}
