# browser_async

Typed callback integration with `moonbitlang/async` on the JavaScript target.
This is an internal package in this workspace, not a separately published module.

`run(life, task, failed)` starts a root TaskGroup at a browser entry point. Spawn
child tasks through that group. `life.close()` releases registered resources
synchronously and cancels the root. `wait[T]` adapts a one-shot callback, carrying
`Result[T, PortError]` inside MoonBit; a `Promise[Unit]` only wakes the coroutine.

```moonbit
let life = @lifetime.Lifetime()
@browser_async.run(life, async fn(group) {
  let resource = @browser_async.wait(
    life,
    register,
    discard=release,
  )
  ignore(life.own(fn() { release(resource) }))
  work(group, resource)
}, failed)
// The owner calls life.close() when the view or operation ends.
```

`register` accepts a typed completion callback and returns an unsubscribe/cancel
function. Cancellation also closes that registration. A late successful value,
or a value cancelled between completion and delivery, goes to `discard`.
Every successful callback transfers ownership of a fresh value: do not replay
the same resource after transferring it. Cleanup must be synchronous and must
not throw. Register delivered resources before the next suspension point.

`Inbox[T]` is a bounded callback ingress with one async reader. `offer` returns
false when full or closed. The caller decides whether overflow is fatal.
Do not enqueue resource ownership without a separate cleanup policy.

The reusable lifetime package contains no browser dependency. This package is
JS-only and uses the official runtime rather than a custom scheduler. Neither
package contains application models, endpoints or UI messages.

Run the cancellation/ownership contract tests without a server or browser:

```sh
npm run moon -- test --target js core/browser_async core/lifetime
```

See [design, prior implementations and limitations](../../docs/async-browser.md).
