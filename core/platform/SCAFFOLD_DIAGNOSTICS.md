# Scaffold Diagnostics

The generated MoonBit scaffold is buildable. Unsupported or ambiguous export surfaces are listed below with the decision taken by the generator.

## Summary

No unsupported exports were detected.

## Fallback Policy

This classification mirrors the real-world bridge quality policy. It is informational in non-strict mode; strict mode still rejects generated `JSValue` fallbacks.

| package | class | policy |
| --- | --- | --- |
| `#speakup/host` | unclassified | Add an explicit fallback policy before accepting this package into the real-world corpus. |