---
status: accepted
---

# Auto-fit zoom scales images up as well as down

`ImageView.render` (`src/image_view.js`) computes `zoom` from the ratio of the available window size to the canvas dimensions and always applies it, in both directions — a large pasted image is scaled down to fit the screen, and a small one is scaled up to fill it. `src/INITIALSPEC.md` item 10 only asked for zoom-out on large images.

Scaling small images up too was a deliberate decision beyond that wording: at zoom 1, a small pasted image (e.g. a few dozen pixels) renders too small to see or select accurately, so scaling it up to fill the available window keeps selection and editing usable. The resulting pixelation on enlarged small images is accepted as a display-only trade-off — Copy/Paste and all pixel manipulation still operate on the untouched underlying bitmap, only the on-screen presentation is scaled.

Do not treat INITIALSPEC.md's "zoom out" wording as a ceiling on this behavior; the auto-fit intentionally works in both directions.
