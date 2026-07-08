# Image CopyPaster

A lightweight, browser-based image editor for pasting, positioning, and transforming images via the system clipboard — a fast paste-select-transform loop in place of ad hoc screenshot cropping/flipping.

## Language

**Canvas**:
The single image currently loaded in the editor; the whole workspace that a Selection and Paste operate against.
_Avoid_: workspace, main image, mainImage

**Selection**:
A rectangular region of the Canvas, drawn by dragging or via Select All, that scopes where a Paste lands and which pixels a manipulation (flip/rotate) affects. Rendered on its own transparent overlay canvas on top of the Canvas's image so redrawing the selection border during a drag never has to repaint the underlying image; the border stays visible after a Paste lands.
_Avoid_: area, region, bounding box

**Paste**:
Insert an image from the system clipboard. With no Selection, the pasted image becomes the Canvas; with an active Selection, the pasted image is resized to fit and composited into it.
_Avoid_: import, insert

**Copy**:
Extract the current Selection's pixels and place them on the system clipboard as a PNG.
_Avoid_: export

**Alpha Key**:
A single color, sampled from the Canvas by the user, designated as the transparency key. Any pixel of this color in a subsequently pasted image is made transparent when Alpha Paste is enabled.
_Avoid_: chroma key, transparency color

**Alpha Paste**:
The mode, toggled by the user, in which an active Alpha Key is applied to the next Paste — stripping matching pixels to transparent as the image lands in the Selection.
_Avoid_: color-to-alpha, transparency toggle

**Bitmap**:
The pixel-data representation of the Canvas or of a cropped/pasted fragment, wrapping the underlying image-processing library so the rest of the app never touches it directly.
_Avoid_: image object, jimp image
