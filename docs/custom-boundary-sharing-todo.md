# TODO: Custom Boundary and Large Setup Sharing

## Problem

Current setup share links are compact enough for QR codes because they omit large
payloads such as custom play-area boundaries. That means bundled play areas can
round-trip through sharing, but custom relation-loaded play areas cannot unless
the receiving app already knows the same boundary.

The same constraint will likely apply to future custom hiding-zone setup, such
as user-curated station lists, custom route groups, or other large geometry/data
that would make a direct QR payload too large.

## Likely Direction

Keep QR/deep-link payloads small and let them reference larger external setup
documents. Treat those documents like custom OSM references:

- The share link carries a small, validated reference instead of full geometry.
- The referenced document contains versioned JSON for boundary geometry,
  hiding-zone custom station lists, attribution/source metadata, and any future
  large setup data.
- Import resolves the reference, validates the JSON schema, previews the setup,
  and only mutates local state after confirmation.
- Persisted local state can still store the resolved data needed for offline use.

Possible reference shapes:

```text
jetlag-hide-seek-v2://import?d=<small-envelope-with-external-ref>
https://example.com/i?d=<small-envelope-with-external-ref>
https://example.com/setup/<content-id>.json
```

## Design Questions

- Should external references be normal HTTPS URLs, content-addressed IDs, or
  both?
- Do referenced payloads need integrity checks, such as a hash in the QR payload?
- What is the minimum schema for a custom play-area document?
- How should the app handle an unreachable reference after the setup was already
  imported once?
- Can custom hiding-zone station lists share the same external document format,
  or should they be separate referenced resources?
- What attribution and source metadata is required for user-provided OSM-derived
  boundaries?

## Implementation Notes

- The compact wire format should make lossy fields explicit, not accidental.
- Import should not silently fall back to `[0, 0, 0, 0]` bboxes for custom play
  areas.
- The app should keep direct QR payloads for small bundled setups and use
  references only when the setup exceeds QR-friendly size limits.
