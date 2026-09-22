# Message migration contract

Source: `Message.tsx` at `018634f`, Node 24.13.0, React 18.3.1, ESM in Chromium.
Regenerate the reducer oracle and original public signature with
`node scripts/capture-message.mjs`. To re-extract the source reducer and public
signature, add `--capture-source` (requires that Git revision). Normal fixture
regeneration uses the checked-in verbatim reducer and also works in shallow CI.

The screen's observable contract is semantic: the same peer, safe text content,
chronologically ordered unique messages, monotonic read receipts, older-page
availability, visibility-gated read acknowledgement, and one idempotency key
per unchanged send retry. IDs are positive signed 32-bit integers; text and
input limits use UTF-16 code units (2,000). Timestamps remain server strings;
the browser formats them in its locale. HTTP paths and payloads are unchanged.

The React export `Message({friendId})` remains available. The new controller's
public API is intentionally independent of React. Its declarations are generated
from MoonBit; renderer-specific types do not enter the controller.

Deliberate corrections: cancel work on disposal, ignore superseded responses,
prevent concurrent older-page loads, and acknowledge older unread messages when
they become visible. These are covered separately from source parity fixtures.
