import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/shell.js";

function harness() {
  let location = { pathname: "/login", conversation: "", token: "" };
  const watchers = new Set(),
    loads = [],
    activity = [],
    events = [];
  const change = (next) => {
    location = { ...location, ...next };
    for (const listener of [...watchers]) listener();
  };
  const app = createApp({
    location: () => location,
    on_location(listener) {
      watchers.add(listener);
      return () => watchers.delete(listener);
    },
    navigate(pathname, replace) {
      events.push(["navigate", pathname, replace]);
      change({ pathname });
    },
    load(name, ready, failed) {
      events.push(["load", name]);
      loads.push({ name, ready, failed });
    },
    load_activity(ready, failed) {
      activity.push({ ready, failed });
    },
    loading() {
      events.push(["loading"]);
    },
    not_found() {
      events.push(["not-found"]);
    },
    failed() {
      events.push(["failed"]);
    },
  });
  const mount = (index, action = () => {}) => {
    const calls = [],
      disposals = [];
    loads[index].ready({
      mount(input) {
        calls.push(input);
        events.push(["mount", index]);
        action(input);
        return () => {
          disposals.push(index);
          events.push(["dispose", index]);
        };
      },
    });
    return { calls, disposals };
  };
  return { app, change, mount, loads, activity, events, watchers };
}

test("route identity preserves drafts and changes conversation or message controllers only when needed", () => {
  const h = harness();
  h.app.start();
  h.app.start();
  const login = h.mount(0);
  h.change({ conversation: "42" });
  assert.equal(h.loads.length, 1);
  h.change({ pathname: "/sessionrecord", conversation: "41" });
  const first = h.mount(1);
  assert.equal(first.calls[0].conversation, "41");
  h.change({ conversation: "42" });
  assert.deepEqual(first.disposals, [1]);
  assert.equal(h.mount(2).calls[0].conversation, "42");
  h.change({ pathname: "/message/2" });
  assert.equal(h.loads[3].name, "/message");
  assert.equal(h.mount(3).calls[0].peer, "2");
  h.change({ pathname: "/message/3" });
  assert.equal(h.mount(4).calls[0].peer, "3");
  assert.deepEqual(login.disposals, [0]);
  h.app.stop();
  h.app.stop();
  assert.equal(h.watchers.size, 0);
});

test("dispose precedes loading; late, duplicate and abandoned chunk completions never mount", () => {
  const h = harness();
  h.app.start();
  h.mount(0);
  h.change({ pathname: "/home" });
  assert.ok(
    h.events.findIndex((e) => e[0] === "dispose") <
      h.events.findIndex((e) => e[1] === "/home"),
  );
  h.change({ pathname: "/memo" });
  assert.equal(h.mount(1).calls.length, 0);
  const memo = h.mount(2);
  assert.equal(h.mount(2).calls.length, 0);
  h.app.stop();
  h.loads[1].failed();
  assert.equal(
    h.events.some((e) => e[0] === "failed"),
    false,
  );
  assert.deepEqual(memo.disposals, [2]);
  h.app.start();
  h.app.stop();
  assert.equal(h.mount(3).calls.length, 0);
});

test("synchronous redirects and render failures dispose a partially mounted page exactly once", () => {
  const h = harness();
  h.app.start();
  const redirected = h.mount(0, () => h.change({ pathname: "/memo" }));
  assert.deepEqual(redirected.disposals, [0]);
  const failed = h.mount(1, (input) => input.failed());
  assert.deepEqual(failed.disposals, [1]);
  assert.equal(h.events.filter((e) => e[0] === "failed").length, 1);
  h.change({ pathname: "/login" });
  h.mount(2);
  h.app.stop();
  assert.deepEqual(failed.disposals, [1]);
});

test("failed chunks and unknown routes remain navigable; aliases replace the URL", () => {
  const h = harness();
  h.app.start();
  h.loads[0].failed();
  h.change({ pathname: "/missing" });
  assert.equal(h.events.at(-1)[0], "not-found");
  h.change({ pathname: "/waiting" });
  assert.ok(
    h.events.some(
      (e) => e[0] === "navigate" && e[1] === "/sessionlist" && e[2] === true,
    ),
  );
  const page = h.mount(1);
  assert.equal(page.calls.length, 1);
  h.loads[0].failed();
  assert.equal(page.disposals.length, 0);
  h.app.stop();
});

test("token replacement retires the activity owner and old lazy activity cannot start after logout", () => {
  const h = harness();
  h.app.start();
  h.mount(0);
  const counters = { start: 0, stop: 0, watch: 0 };
  const value = {
    get_snapshot: () => ({
      revision: 0,
      inbox: { items: [], unread: 0, now: 0 },
      items: [],
      connected: false,
      clockOffset: 0,
      error: "",
      open: false,
      busy: false,
      read_error: "",
    }),
    subscribe() {
      counters.watch++;
      return () => counters.watch--;
    },
    start() {
      counters.start++;
    },
    stop() {
      counters.stop++;
    },
    set_open() {},
    refresh() {},
    read() {},
  };
  assert.equal(h.activity.length, 0);
  h.change({ token: "first" });
  h.mount(1);
  h.activity[0].ready(value);
  assert.equal(counters.start, 1);
  h.change({ token: "second" });
  h.mount(2);
  assert.equal(counters.stop, 1);
  assert.equal(counters.watch, 0);
  h.change({ token: "" });
  h.mount(3);
  h.activity[1].ready(value);
  assert.equal(counters.start, 1);
  h.app.stop();
});
