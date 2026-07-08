---
status: accepted
---

# Precompute the copy blob before the copy event, not inside its handler

`ImageController.handleCopy` (`src/image_controller.js`) reads `model.pendingCopyBlob` and writes it to the clipboard synchronously — it never crops or encodes the image itself. `ImageModel.updateCopyBlob` (`src/image_model.js`) runs eagerly whenever a selection is finalized (`handleMouseUp`) or made via Select All, cropping the selection and encoding it to a PNG blob ahead of time, cached as `pendingCopyBlob`.

This ordering is required by the browser's clipboard-write activation window. `navigator.clipboard.write()` (and the `copy` event's implicit permission to write) only work inside the transient user-activation opened by the triggering gesture — here, the Ctrl/Cmd+C keypress. Encoding a selection to PNG is async (`Bitmap.getBufferAsync`); if that encode were started inside `handleCopy` itself, the `await` would cross out of the activation window before the write runs, and the write would silently fail (or throw `NotAllowedError`) in browsers that enforce this strictly. Doing the async encode as soon as the selection is known — not when the user asks to copy it — means `handleCopy` only has to perform an already-synchronous clipboard write inside the gesture.

Do not move blob creation into `handleCopy`/the `copy` handler, even to simplify the flow — it would reintroduce the activation-window race this design avoids.
