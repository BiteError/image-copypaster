# Image CopyPaster

A lightweight, browser-based image editor for pasting, positioning, and transforming images via the system clipboard — a fast paste-select-transform loop in place of ad hoc screenshot cropping/flipping.

## Language

**Canvas**:
The single image currently loaded in the editor; the whole workspace that a Selection and Paste operate against.
_Avoid_: workspace, main image, mainImage

**Selection**:
A rectangular or elliptical region of the Canvas, drawn by dragging or via Select All, that scopes where a Paste lands and which pixels a manipulation (flip/rotate) affects. Rendered on its own transparent overlay canvas on top of the Canvas's image so redrawing the selection border during a drag never has to repaint the underlying image; the border stays visible after a Paste lands. Its Shape can be switched at any time — mid-drag or after it's already drawn — and the switch applies retroactively to the current Selection, not just to the next one drawn.
_Avoid_: area, region, bounding box

**Shape**:
Whether a Selection is rectangular or elliptical. Toggled via the Space shortcut or the toolbar's shape button, both of which flip the Shape of the current Selection (if one exists) in addition to setting the default for the next Selection drawn.
_Avoid_: shape mode, selection type

**Paste**:
Insert an image from the system clipboard. With no Selection, the pasted image becomes the Canvas immediately. With an active Selection, the pasted image becomes a Floating Layer sized to the Selection's bounds, pending a Commit — it is no longer baked into the Canvas until then.
_Avoid_: import, insert

**Floating Layer**:
The state a Selection enters once a Paste gives it pixel content, non-destructive and uncommitted. Holds its original bitmap untouched alongside position, size, rotation, and flip transform parameters; every render re-derives the displayed pixels from the original bitmap rather than baking transforms in, so repeated adjustment never compounds quality loss. Shares the Selection's Shape for masking and outline. Only one can exist at a time — it must Commit or Cancel before another Paste can start.
_Avoid_: preview layer, pending paste, staged image

**Handle**:
One of eight small squares (four corners, four edge midpoints) rendered around a Floating Layer's bounding box, used to resize it by dragging. Corner Handles resize both axes; edge Handles resize a single axis. Holding Shift while dragging a Handle locks the Floating Layer's original aspect ratio. Dragging a Handle past the opposite Handle is allowed and flips the Floating Layer through.
_Avoid_: grip, anchor

**Commit**:
Bake a Floating Layer's current transform into the Canvas at its current position/size, then clear the Floating Layer — the same composite-and-save-history path a destructive Paste used to follow directly. Triggered by Enter, clicking outside the Floating Layer, starting a new Selection or Paste elsewhere, switching Shape, or Copy (which always commits first so it reads the same composited pixels everything else sees).
_Avoid_: apply, finalize, bake

**Cancel**:
Discard a Floating Layer entirely via Escape, reverting to whatever was on the Canvas before the Paste that created it. Since the Canvas was never touched, no history entry is created.
_Avoid_: discard, revert, undo

**Copy**:
Extract the current Selection's pixels and place them on the system clipboard as a PNG.
_Avoid_: export

**Alpha Key**:
A single color, sampled from the Canvas by the user, designated as the transparency key. Any pixel of this color, or within the configured Tolerance of it, in a subsequently pasted image is made transparent when Alpha Paste is enabled.
_Avoid_: chroma key, transparency color

**Alpha Paste**:
The mode, toggled by the user, in which an active Alpha Key is applied to the next Paste — stripping matching pixels to transparent as the image lands in the Selection.
_Avoid_: color-to-alpha, transparency toggle

**Tolerance**:
A user-configurable 0-100 value scoping how close a pixel's color must be to the Alpha Key (by RGB distance) to count as a match during Alpha Paste. Zero matches the Alpha Key color exactly; higher values also catch near-miss pixels such as anti-aliased edges.
_Avoid_: threshold, fuzziness, sensitivity

**Bitmap**:
The pixel-data representation of the Canvas or of a cropped/pasted fragment, wrapping the underlying image-processing library so the rest of the app never touches it directly.
_Avoid_: image object, jimp image
