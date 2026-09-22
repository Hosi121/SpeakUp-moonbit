///|
priv struct Request {
  verb : String
  path : String
  body : String
  done : (Double, String, Bool) -> Unit
  mut canceled : Bool
}

///|
fn harness() -> (@thread.ThreadController, Array[Request]) {
  let requests : Array[Request] = []
  let keys = Ref(0)
  let controller = @thread.create_controller(2, {
    request: fn(verb, path, body, done) {
      let request = Request::{ verb, path, body, done, canceled: false, }
      requests.push(request)
      fn() { request.canceled = true }
    },
    random_id: fn() {
      keys.val += 1
      "key-\{keys.val}"
    },
    format_time: fn(value) { value },
    is_visible: fn() { true },
    on_visibility: fn(_listener) { fn() { () } },
    on_activity: fn(_listener) { fn() { () } },
  })
  (controller, requests)
}

///|
fn payload(id : Int, incoming : Bool, read : Bool) -> String {
  let sender = if incoming { 2 } else { 1 }
  let recipient = if incoming { 1 } else { 2 }
  let body : Json = {
    "peer": { "id": 2, "username": "Bob", "avatar_url": "" },
    "messages": [
      {
        "id": id,
        "sender_id": sender,
        "recipient_id": recipient,
        "body": "日本語",
        "created_at": "2026-09-22T10:00:00Z",
        "read_at": if read {
          "read"
        } else {
          ""
        },
      },
    ],
    "has_older": false,
  }
  body.stringify()
}

///|
test "late completion cannot start a read after stop or restart" {
  let (controller, requests) = harness()
  (controller.start)()
  (controller.stop)()
  assert_true(requests[0].canceled)
  (controller.start)()
  (requests[0].done)(200, payload(1, true, false), false)
  assert_eq(requests.length(), 2)
  assert_false((controller.get_snapshot)().loaded)
  (requests[1].done)(200, payload(2, false, false), false)
  assert_eq((controller.get_snapshot)().messages[0].id, 2)
}

///|
test "retry body and request key are retained and concurrent sends are ignored" {
  let (controller, requests) = harness()
  (controller.start)()
  (requests[0].done)(200, payload(1, false, false), false)
  (controller.set_draft)("hello 😀")
  (controller.send)()
  (controller.send)()
  assert_eq(requests.length(), 2)
  assert_eq(requests[1].verb, "POST")
  assert_eq(requests[1].path, "/messages/2")
  (requests[1].done)(0, "", true)
  assert_eq((controller.get_snapshot)().draft, "hello 😀")
  (controller.send)()
  assert_eq(requests[1].body, requests[2].body)
  (requests[2].done)(200, payload(2, false, false), false)
  assert_eq((controller.get_snapshot)().draft, "")
}

///|
test "read receipts never regress when an old unread snapshot arrives" {
  let (controller, requests) = harness()
  (controller.start)()
  (requests[0].done)(200, payload(1, false, true), false)
  (controller.refresh)()
  (requests[1].done)(200, payload(1, false, false), false)
  assert_true((controller.get_snapshot)().messages[0].read)
}

///|
test "full width space and BOM are empty drafts in browser semantics" {
  let (controller, requests) = harness()
  (controller.start)()
  (requests[0].done)(200, payload(1, false, false), false)
  for draft in ["", "\u{3000}", "\u{FEFF}", "\u{00A0}"] {
    (controller.set_draft)(draft)
    assert_false((controller.get_snapshot)().can_send)
  }
  (controller.set_draft)("日本語")
  assert_true((controller.get_snapshot)().can_send)
}
