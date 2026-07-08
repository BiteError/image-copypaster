---
status: accepted
---

# Enforce strict MVC boundaries: model is DOM-free, Jimp stays inside Bitmap

This codebase follows a strict MVC split across `src/image_model.js`, `src/image_view.js`, and `src/image_controller.js`:

- **Model** (`ImageModel`, `Bitmap`/`JimpBitmap` in `src/bitmap.js`) never touches the DOM or any browser UI API. It only manipulates image data at the byte level, via Jimp, wrapped behind `Bitmap`'s own method names (`crop`, `composite`, `flip_horizontal`, etc.) so the rest of the app never calls into Jimp directly.
- **View** (`ImageView`) owns all Canvas 2D context and DOM element access. It renders whatever bitmap/selection state the controller hands it; it does not decide *when* to render or *what* the state should be.
- **Controller** (`ImageController`) is the only place that wires DOM events (keydown, mouse, paste, copy) to model calls and triggers view re-renders. It holds no image data itself.

Jimp is a bundled dependency (see `package.json`), not loaded from a CDN, and is only ever imported in `src/bitmap.js` — no other file imports `jimp` directly.

Keep this boundary when extending the app: new image operations go on `Bitmap`/`ImageModel`, not inlined into the controller; new UI affordances go through `ImageView`, not direct DOM calls from the controller or model. Do not import `jimp` outside `src/bitmap.js`.
