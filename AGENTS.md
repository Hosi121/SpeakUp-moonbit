# SpeakUp MoonBit

Use the MoonBit migration and JS binding skills for MoonBit changes.
Domain code belongs in `core/`; React rendering and platform I/O stay in adapters.
Do not introduce `Any`, `JSValue`, generic unchecked casts, or TypeScript `any`
into handwritten code. Parse untrusted JSON at ingress. Generated bindings are
regenerated with `npm run generate`, never edited by hand. Inspect diagnostics.
Do not access the original application's database or copy its `.env` files.
Run `npm run check`, `npm test`, and the isolated MySQL integration tests.
Document deliberate differences from SpeakUp in `docs/migration.md`.
