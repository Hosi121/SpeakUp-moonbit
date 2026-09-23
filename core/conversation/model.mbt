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
pub(all) enum Phase {
  Planned
  Active(Double)
  Completed(Double, Double)
  Cancelled(Double)
}

///|
pub(all) enum Origin {
  Direct
  Event(Int, Int)
}

///|
pub(all) enum Action {
  Start
  Finish
  Cancel
  Expire
}

///|
/// Only restore and transitions can construct a validated conversation.
/// Timestamps and revision are projections of the phase, not independent state.
pub struct Conversation {
  priv id : Int
  priv first : Int
  priv second : Int
  priv phase : Phase
  priv origin : Origin
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
pub fn restore(
  s : Snapshot,
  event_id? : Int = 0,
  round? : Int = 0,
) -> Conversation raise StateError {
  guard s.id > 0 &&
    s.first > 0 &&
    s.second > s.first &&
    valid_time(s.started_at) &&
    valid_time(s.ended_at) &&
    valid_time(s.cancelled_at) else {
    raise InvalidSnapshot
  }
  let origin = match (event_id, round) {
    (0, 0) => Direct
    (event, round) if event > 0 && round > 0 => Event(event, round)
    _ => raise InvalidSnapshot
  }
  let phase = match (s.started_at, s.ended_at, s.cancelled_at) {
    (0, 0, 0) => Planned
    (0, 0, cancelled) => Cancelled(cancelled)
    (start, 0, 0) => Active(start)
    (start, end, 0) if start > 0 && end >= start => Completed(start, end)
    _ => raise InvalidSnapshot
  }
  let c = Conversation::{
    id: s.id,
    first: s.first,
    second: s.second,
    phase,
    origin,
  }
  guard s.revision == c.revision() else { raise InvalidSnapshot }
  c
}

///|
pub fn Conversation::phase(self : Conversation) -> Phase {
  self.phase
}

///|
pub fn Conversation::origin(self : Conversation) -> Origin {
  self.origin
}

///|
pub fn Conversation::id(self : Conversation) -> Int {
  self.id
}

///|
pub fn Conversation::revision(self : Conversation) -> Int {
  match self.phase {
    Planned => 0
    Active(_) | Cancelled(_) => 1
    Completed(_, _) => 2
  }
}

///|
pub fn Conversation::snapshot(self : Conversation) -> Snapshot {
  let (started_at, ended_at, cancelled_at) = match self.phase {
    Planned => (0.0, 0.0, 0.0)
    Active(start) => (start, 0.0, 0.0)
    Completed(start, end) => (start, end, 0.0)
    Cancelled(at) => (0.0, 0.0, at)
  }
  {
    id: self.id,
    first: self.first,
    second: self.second,
    started_at,
    ended_at,
    cancelled_at,
    revision: self.revision(),
  }
}

///|
fn Conversation::authorize(
  self : Conversation,
  actor : Int,
) -> Unit raise StateError {
  if actor != self.first && actor != self.second {
    raise NotParticipant
  }
}

///|
pub fn Conversation::partner(
  self : Conversation,
  actor : Int,
) -> Int raise StateError {
  self.authorize(actor)
  if actor == self.first {
    self.second
  } else {
    self.first
  }
}

///|
pub fn Conversation::can_join(self : Conversation) -> Bool {
  match self.phase {
    Planned | Active(_) => true
    Completed(_, _) | Cancelled(_) => false
  }
}

///|
pub fn Conversation::has_deadline(self : Conversation) -> Bool {
  match self.origin {
    Direct => false
    Event(_, _) => true
  }
}

///|
/// The same lifecycle applies to direct and event calls. Only event calls expire.
pub fn Conversation::change(
  self : Conversation,
  action : Action,
  actor : Int,
  now : Double,
) -> Conversation raise StateError {
  self.authorize(actor)
  if action is Expire {
    match (self.origin, self.phase) {
      (Event(_, _), Active(start)) if now >= start + 300000 => ()
      _ => return self
    }
  }
  guard valid_time(now) && now > 0 else { raise InvalidClock }
  let phase = match (action, self.phase) {
    (Start, Planned) => Active(now)
    (Start, Active(_)) => return self
    (Start, Completed(_, _) | Cancelled(_)) => raise AlreadyCompleted
    (Finish | Expire, Planned) => raise NotStarted
    (Finish | Expire, Active(start)) => {
      let end = if self.has_deadline() && now > start + 300000 {
        start + 300000
      } else {
        now
      }
      Completed(start, if end < start { start } else { end })
    }
    (Finish | Expire, Completed(_, _)) => return self
    (Finish | Expire, Cancelled(_)) => raise AlreadyCompleted
    (Cancel, Planned) => Cancelled(now)
    (Cancel, Cancelled(_)) => return self
    (Cancel, Active(_)) => raise AlreadyStarted
    (Cancel, Completed(_, _)) => raise AlreadyCompleted
  }
  { ..self, phase, }
}

///|
pub fn Conversation::remaining(
  self : Conversation,
  now : Double,
) -> Int raise StateError {
  self.remaining_for(now, if self.has_deadline() { 300 } else { 0 })
}

///|
fn Conversation::remaining_for(
  self : Conversation,
  now : Double,
  duration : Int,
) -> Int raise StateError {
  guard valid_time(now) && duration >= 0 else { raise InvalidClock }
  match self.phase {
    Planned => if duration == 0 { -1 } else { duration }
    Completed(_, _) | Cancelled(_) => 0
    Active(start) => {
      if duration == 0 {
        return -1
      }
      let elapsed = (now - start) / 1000.0
      if elapsed <= 0 {
        duration
      } else if elapsed >= duration.to_double() {
        0
      } else {
        duration - elapsed.to_int()
      }
    }
  }
}

///|
pub fn Phase::label(self : Phase) -> String {
  match self {
    Planned => "planned"
    Active(_) => "active"
    Completed(_, _) => "completed"
    Cancelled(_) => "cancelled"
  }
}

///|
/// Compatibility adapters for flat snapshots. Internal consumers retain Conversation.
pub fn begin(
  s : Snapshot,
  actor : Int,
  now : Double,
) -> Snapshot raise StateError {
  restore(s).change(Start, actor, now).snapshot()
}

///|
pub fn finish(
  s : Snapshot,
  actor : Int,
  now : Double,
) -> Snapshot raise StateError {
  restore(s).change(Finish, actor, now).snapshot()
}

///|
pub fn cancel(
  s : Snapshot,
  actor : Int,
  now : Double,
) -> Snapshot raise StateError {
  restore(s).change(Cancel, actor, now).snapshot()
}

///|
pub fn state(s : Snapshot) -> String raise StateError {
  restore(s).phase().label()
}

///|
pub fn partner(s : Snapshot, actor : Int) -> Int raise StateError {
  restore(s).partner(actor)
}

///|
pub fn remaining(
  s : Snapshot,
  now : Double,
  duration_seconds : Int,
) -> Int raise StateError {
  restore(s).remaining_for(now, duration_seconds)
}

///|
pub extend Snapshot with ToJson::{to_json}

///|
pub extend Snapshot with @json.FromJson::{from_json}

///|
pub extend StateError with Eq::{equal, not_equal}

///|
pub extend StateError with @debug.Debug::{to_repr}
