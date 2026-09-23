///|
/// Identity is resolved at the boundary; business rules only need the two roles.
pub(all) enum Member {
  First
  Second
} derive(Eq, Debug)

///|
pub(all) enum Action {
  Request
  Accept
  Reject
  Cancel
}

///|
/// Remember the requester even after acceptance/decline, so retries cannot
/// turn into consent from the wrong participant.
pub(all) enum State {
  Absent
  Pending(Member)
  Accepted(Member)
  Declined(Member)
  Blocked
} derive(Eq, Debug)

///|
pub(all) enum Notice {
  Requested
  Accepted
} derive(Eq, Debug)

///|
/// Only this package can construct a decision. The repository can inspect it.
/// `notice` is the durable notification to ensure for this revision, including
/// on a retry; the repository's event key prevents a second notification.
pub struct Decision {
  next : State
  notice : Notice?
}

///|
pub(all) suberror Rejected {
  NoPending
  Conflict
}

///|
/// Pure policy. Persistence must atomically compare the observed revision,
/// apply the decision and insert the revision-scoped notification.
pub fn decide(
  before : State,
  action : Action,
  actor : Member,
) -> Decision raise Rejected {
  let next = match action {
    Request =>
      match before {
        Absent | Declined(_) => Pending(actor)
        Pending(requester) =>
          if actor == requester {
            before
          } else {
            raise Conflict
          }
        Accepted(_) => before
        Blocked => raise Conflict
      }
    Accept =>
      match before {
        Pending(requester) | Accepted(requester) =>
          if actor != requester {
            Accepted(requester)
          } else {
            raise Conflict
          }
        Absent => raise NoPending
        Declined(_) | Blocked => raise Conflict
      }
    Reject =>
      match before {
        Pending(requester) | Declined(requester) =>
          if actor != requester {
            Declined(requester)
          } else {
            raise Conflict
          }
        Absent => raise NoPending
        Accepted(_) | Blocked => raise Conflict
      }
    Cancel =>
      match before {
        Pending(requester) | Declined(requester) =>
          if actor == requester {
            Declined(requester)
          } else {
            raise Conflict
          }
        Absent => raise NoPending
        Accepted(_) | Blocked => raise Conflict
      }
  }
  let notice = match action {
    Request =>
      match next {
        Pending(_) => Some(Notice::Requested)
        _ => None
      }
    Accept => Some(Notice::Accepted)
    Reject | Cancel => None
  }
  { next, notice, }
}

///|
pub extend State with Eq::{equal, not_equal}

///|
pub extend State with @debug.Debug::{to_repr}

///|
pub extend Member with Eq::{equal, not_equal}

///|
pub extend Member with @debug.Debug::{to_repr}

///|
pub extend Notice with Eq::{equal, not_equal}

///|
pub extend Notice with @debug.Debug::{to_repr}

///|
/// Strings are confined to HTTP/legacy JS adapters; both use the same command vocabulary.
pub fn Action::parse(value : String) -> Action? {
  match value {
    "request" => Some(Request)
    "accept" => Some(Accept)
    "reject" => Some(Reject)
    "cancel" => Some(Cancel)
    _ => None
  }
}

///|
pub fn Action::path(self : Action) -> String {
  match self {
    Request => "request"
    Accept => "accept"
    Reject => "reject"
    Cancel => "cancel"
  }
}
