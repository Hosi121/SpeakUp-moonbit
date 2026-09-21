# Captured contracts

- Source commit/runtime: `source.json`.
- Frozen original DTO/view definitions: `dto.ts`, `view.ts`.
- Original pure transformation bodies and Go serializer: `source/`.
- Generated expected outputs: `fixtures.json`; regenerate with `npm run fixtures`.
- Level: JSON structural for DTO mappings, avatar strings and signaling payloads.
- Existing source had no application test suite to carry over. New tests exercise
  captured functions and public protocol invariants; there are no pending stubs.
- Mappers were private functions; service exports and React consumers remain TS.
- Missing memo fields normalize to empty strings at the adapter.
- TypeScript view values are structurally equivalent; MoonBit structs use class
  prototypes. Object identity/prototypes are not part of this contract.
- IDs at server ingress are positive signed 32-bit integers, dates are strings,
  textual SDP is a string, uploads/media are bytes and stay in platform adapters.
- Protocol/auth/schema changes are enumerated in `docs/migration.md`.
