# Message source contract

Pinned source: `Message.tsx` at `018634f`
(Node 24.13.0, React 18.3.1, ESM in Chromium).
React describes the captured source; the current app uses a DOM renderer.

Run `node scripts/capture-message.mjs` to regenerate outputs from the checked-in reducer.
Use `--capture-source` only to re-extract from the pinned revision; it requires that Git history.
Normal fixture generation also works in shallow CI.

The observable contract is the same peer, safe text, chronological unique messages,
monotonic read receipts, older-page availability, visibility-gated read acknowledgement,
and one idempotency key per unchanged send retry.
IDs are positive signed 32-bit integers; text limits use UTF-16 code units (2,000).
Timestamps remain server strings and are displayed in the browser locale.

The historical React export is reference material. Current controller declarations are generated
from MoonBit and do not contain renderer-specific types.
Disposal, superseded responses, duplicate page loads and older-message read acknowledgement
are checked separately from source parity. See [frontend.md](../../docs/frontend.md) and
[testing.md](../../docs/testing.md).
