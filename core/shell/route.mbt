///|
pub(all) struct RouteView {
  page : String
  redirect : String
  peer : String
}

///|
/// Percent decoding is the browser URI primitive; route policy is shared here.
pub fn route(decoded : String) -> RouteView {
  let page = decoded.trim_end(chars="/").to_owned().to_lower()
  let redirect = match page {
    "" => if decoded.is_empty() { "" } else { "/login" }
    "/waiting" | "/sessioninterval" => "/sessionlist"
    "/trophynotification" => "/stats"
    _ => ""
  }
  let parts = page.split("/").to_array()
  let peer = if parts.length() == 3 && parts[1] == "message" {
    parts[2].to_owned()
  } else {
    ""
  }
  { page, redirect, peer, }
}
