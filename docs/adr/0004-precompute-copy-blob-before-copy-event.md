---
status: accepted
---

# Precompute the copy blob before the copy event, not inside its handler

`handleCopy` writes `model.pendingCopyBlob` to the clipboard synchronously; it never crops or encodes. `ImageModel.updateCopyBlob` does that work eagerly, ahead of any Copy, caching the PNG blob.

**Why the ordering matters:** `navigator.clipboard.write()` only works inside the transient user-activation the Ctrl/Cmd+C gesture opens. PNG encoding is async (`Bitmap.getBufferAsync`); awaiting it inside `handleCopy` would leave that window and make the write fail (`NotAllowedError` in strict browsers). Encoding when the selection changes — not when Copy is pressed — keeps `handleCopy` a synchronous write. Don't move blob creation into `handleCopy`; it reintroduces this race.

**Freshness invariant:** because the blob is precomputed, every path that changes which pixels the selection covers must refresh it, or Copy serves a stale blob. Those paths: new marquee, move, and resize (all at gesture-end in `handlePointerUp` — never per pointer-move, which would re-encode each frame and jank the drag), Select All, and reshape. A Floating Layer is exempt — Copy commits it first and re-encodes from real pixels, so move/reshape of the layer skip the refresh rather than crop `mainImage` under it.
