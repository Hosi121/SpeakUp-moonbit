///|
/// Call with ranks batch-loaded once and participants ordered by a seeded shuffle.
pub(all) struct Participant {
  user_id : Int
  rank : Int
  participates_bit : Int
} derive(FromJson)

///|
pub extend Participant with @json.FromJson::{from_json}

///|
pub(all) struct Pair {
  first : Int
  second : Int
}

///| Rank ordering is stable; rotate one half per round to reduce repeat partners.

///|
/// An odd participant waits unless an available admin is supplied explicitly.
pub fn pair_round(
  participants : Array[Participant],
  round : Int,
  admin : Int,
) -> Array[Pair] {
  if round < 1 || round > 3 {
    return []
  }
  let seen : Map[Int, Bool] = Map([])
  let active : Array[Participant] = []
  for p in participants {
    if p.user_id > 0 &&
      p.rank >= 1 &&
      p.rank <= 5 &&
      p.participates_bit >= 0 &&
      p.participates_bit <= 7 &&
      (p.participates_bit & (1 << (round - 1))) != 0 &&
      !seen.contains(p.user_id) {
      active.push(p)
      seen[p.user_id] = true
    }
  }
  active.sort_by(fn(a, b) { a.rank.compare(b.rank) })
  if active.length() % 2 == 1 && admin > 0 && !seen.contains(admin) {
    active.push({ user_id: admin, rank: 5, participates_bit: 7, })
  }
  let count = active.length() / 2
  let result : Array[Pair] = []
  for i in 0..<count {
    let second = (i + round - 1) % count * 2 + 1
    result.push({
      first: active[i * 2].user_id,
      second: active[second].user_id,
    })
  }
  result
}
