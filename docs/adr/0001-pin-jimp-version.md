---
status: accepted
---

# Pin Jimp to 1.6.0

Bitmap (`src/bitmap.js`) wraps Jimp for all pixel-level work (decode, crop, composite, encode). We pin `jimp` to exactly `1.6.0` in `package.json` rather than a caret range because the version(s) after it ship broken ES module exports (see [jimp-dev/jimp#1402](https://github.com/jimp-dev/jimp/issues/1402)), which breaks importing Jimp entirely. Do not bump `jimp` past `1.6.0` until upstream fixes this and it has been re-verified.
