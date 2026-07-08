---
status: accepted
---

# Avoid Jimp.fromBitmap for test bitmap construction

`Jimp.fromBitmap({data, width, height})` in the pinned Jimp `1.6.0` (see [0001-pin-jimp-version.md](0001-pin-jimp-version.md)) silently corrupts the pixel buffer when `width * height < 8192`: it reports the correct `width`/`height` but returns a `bitmap.data` padded to a fixed 65536 bytes and filled with unrelated garbage, instead of throwing. The threshold is exact and reproducible (confirmed via bisection: 8100px corrupts, 8281px doesn't), so any raw-array bitmap construction under ~90x90 is affected.

This codebase never called `Jimp.fromBitmap` in production — the real paste-from-clipboard path decodes PNG blobs via `Jimp.read`, which is unaffected. The only caller was a test-only helper (`Bitmap.CreateBitmapFromArray`) used to build synthetic bitmaps for `src/tests/`. Rather than keep that helper around behind a size guard (fencing off a landmine a future caller could still hit), we deleted it and rewrote the test bitmap builders in `src/tests/test_helpers.js` to construct images via `new Jimp({width, height, color})` followed by direct `bitmap.data` writes for corner-pixel overrides. That constructor path was verified safe at any size, including well below the 8192-pixel threshold (e.g. 20x10).

Do not reintroduce `Jimp.fromBitmap` for constructing bitmaps from raw pixel arrays while pinned to `1.6.0`.
