# SpeakUp MoonBit

Use the MoonBit migration and JS binding skills for MoonBit changes.
Shared SQL sessions, the native MySQL adapter and WebSocket session primitives live in the external
`vendor/servicekit` Git submodule. Make changes in its repository, verify there,
then update the pinned submodule commit; do not restore an application-local copy.
Domain code belongs in `core/`; React rendering and platform I/O stay in adapters.
Do not introduce `Any`, `JSValue`, generic unchecked casts, or TypeScript `any`
into handwritten code. Parse untrusted JSON at ingress. Generated bindings are
regenerated with `npm run generate`, never edited by hand. Inspect diagnostics.
Do not access the original application's database or copy its `.env` files.
Run `npm run check`, `npm test`, `npm run test:native`, and the isolated
`npm run test:integration:native` tests. Changes to call transport also require
`npm run test:browser:native`. The default backend is native; the Node server
is retained for parity tests. Never pass MoonBit-managed memory into C workers.
Document deliberate differences from SpeakUp in `docs/migration.md`.
