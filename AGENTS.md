# SpeakUp MoonBit

Use the MoonBit migration and JS binding skills for MoonBit changes.
Shared SQL sessions, the native MySQL adapter and WebSocket session primitives
are published Mooncakes dependencies from Hosi121/moonbit-sessions. Make library
changes in that repository, verify and release them there, then update the module
versions in moon.mod; do not restore an application-local copy or submodule.
Explicit lifetimes and browser callback adapters are published dependencies from
Hosi121/moonbit-lifetime (`Hosi121/lifetime` and `Hosi121/lifetime_js`). Maintain
their generic implementation and race tests there, then update registry versions
here. Keep call policy and typed media ports in this application.
Domain code belongs in `core/`; DOM rendering and platform I/O stay in adapters.
Do not introduce `Any`, `JSValue`, generic unchecked casts, or TypeScript `any`
into handwritten code. Parse untrusted JSON at ingress. Generated bindings are
regenerated with `npm run generate`, never edited by hand. Inspect diagnostics.
Once an HTTP response starts, propagate write failures to connection cleanup;
never render a second error response. Cover client disconnects with real sockets.
Do not access the original application's database or copy its `.env` files.
Run `npm run check`, `npm test`, `npm run test:native`, and the isolated
`npm run test:integration:native` tests. Changes to call transport also require
`npm run test:browser:native`. The default backend is native; the Node server
is retained for parity tests. Never pass MoonBit-managed memory into C workers.
Document deliberate differences from SpeakUp in `docs/migration.md`.
Keep docs organized by topic: current contracts, decisions with reasons and
constraints, and runnable instructions. Update the existing canonical page;
do not append work diaries, per-change test counts, or duplicate summaries.
Keep measurements in `bench/` and reference their conditions from `docs/performance.md`.
