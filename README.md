# Image CopyPaster

A lightweight, browser-based image editor. It makes image handling as easy as text. If you find yourself constantly taking screenshots just to flip them or move them into a specific area, this is for you. Select your target, paste your image, and use basic tools to get the look right. No bloated menus—just the tools you need to get the job done.

## 🚀 Key Features

*   **Fast Workflow**: Start instantly by pasting straight from your system clipboard, or open a local file with the **Open** button.
*   **Floating Paste Layer**: Pasting into a selection no longer bakes in immediately — the incoming image lands as a movable, resizable floating layer. Reposition it, drag a handle to resize (hold Shift to lock aspect ratio), nudge it with the arrow keys, and flip/rotate it freely with no quality loss, then press **Enter** to commit it into the canvas or **Escape** to cancel.
*   **Undo / Redo**: Every commit is recorded, so you can step backward and forward through your edits with **Cmd/Ctrl + Z** and **Cmd/Ctrl + Shift + Z**.
*   **Chroma Key (Color-to-Alpha)**: Sample any color from the current image to act as a transparency key. When **Alpha Paste** is enabled, that color is removed from future pasted images, with a **Tolerance** slider to also catch near-miss and anti-aliased pixels.
*   **Smart Auto-Zoom**: Automatically fits large images to the browser window while maintaining the original resolution for editing.
*   **Non-Destructive UI**: The selection borders (marching ants) maintain a consistent visual thickness regardless of the zoom level.
*   **Symmetry Tools**: Flip or rotate the selection without affecting the rest of the canvas.
*   **Switchable Selection Shape**: Toggle a selection between rectangle and ellipse with **Space** or the toolbar's shape button — works mid-drag or on an already-drawn selection. A **Roundness** slider morphs the ellipse continuously from a diamond, through a plain ellipse, to a rounded rectangle.
*   **Works on Touch**: A compact mobile toolbar exposes the same tools (with a drawer for the less-frequent ones) and drag-to-move/resize gestures on phones and tablets.

## ⌨️ Hotkeys

The application supports both **macOS (⌘)** and **Windows/Linux (Ctrl)** shortcuts.

| Shortcut | Action |
| :--- | :--- |
| **Cmd/Ctrl + V** | Paste image from clipboard into the selected area, as a floating layer if a selection is active. Pasting again while a floating layer is active commits it first, then starts a new one. |
| **Cmd/Ctrl + C** | Copy the currently selected area back to the clipboard (commits any active floating layer first). |
| **Cmd/Ctrl + A** | Select the entire image area. |
| **Cmd/Ctrl + Z** | Undo the last committed change. |
| **Cmd/Ctrl + Shift + Z** / **Cmd/Ctrl + Y** | Redo. |
| **V** | Flip vertically selected area, or the floating layer if one is active. |
| **H** | Flip horizontally selected area, or the floating layer if one is active. |
| **R** | Rotate right selected area, or the floating layer if one is active. |
| **Shift + R** | Rotate left selected area, or the floating layer if one is active. |
| **Drag Mouse** | Create a custom rectangular or elliptical selection. |
| **Drag Floating Layer** | Move the floating pasted layer. |
| **Drag Handle** | Resize the floating pasted layer — corner handles resize both axes, edge handles resize one axis. |
| **Shift + Drag Handle** | Lock the floating pasted layer's aspect ratio while resizing. |
| **Arrow Keys** | Nudge the floating pasted layer by 1px. |
| **Shift + Arrow Keys** | Nudge the floating pasted layer by 10px. |
| **Enter** | Commit the floating pasted layer into the canvas. |
| **Escape** | Cancel the floating pasted layer, or clear the current selection if none is floating. |
| **Space** | Switch the selection shape between rectangle and ellipse — applies to an in-progress drag or an already-drawn selection (commits any active floating layer first). |
| **Opt/Alt + Click** | Sample the alpha color from the canvas. |
| **Shift + Opt/Alt + Click** | Clear the alpha color. |
| **?** | Toggle the keyboard-shortcuts panel. |

## 🛠 How to Use

### 1. Starting a Project
Press the **Paste** shortcut (**Cmd/Ctrl + V**) or click **Paste** — the browser will request clipboard permission if necessary, and the image in your clipboard becomes the main canvas. Alternatively, click **Open** to load an image file from disk. Use **New** to clear the canvas and start over.

### 2. Manipulating Areas
Use your mouse to drag a box over an area, or select the whole canvas with **Cmd/Ctrl + A**. You can now:
*   Press **Cmd/Ctrl + C** (or click **Copy**) to copy the selected area to your clipboard.
*   Press **Cmd/Ctrl + V** to paste a new image from your clipboard into that section.
*   Press **H / V / R** to transform the selected area.
*   Press **Space**, or click the toolbar's shape button, to switch the selection between rectangle and ellipse — this affects the selection you already have, not just the next one you draw. Drag the **Roundness** slider to reshape the ellipse from a diamond to a rounded rectangle.
*   Step through your edits with **Cmd/Ctrl + Z** (undo) and **Cmd/Ctrl + Shift + Z** (redo).

### 3. Adjusting a Floating Paste
Pasting into an active selection doesn't land on the canvas right away — it becomes a floating layer you can adjust:
*   Drag inside the floating layer to move it.
*   Drag one of its eight handles to resize it (hold **Shift** to lock the aspect ratio).
*   Use the arrow keys to nudge it by 1px, or **Shift + arrow keys** for 10px.
*   Press **H / V / R** to flip or rotate it — repeatable with no quality loss since nothing is baked in yet.
*   Press **Enter**, click outside the floating layer, or start a new selection/paste/tool to commit it into the canvas.
*   Press **Escape** to discard it and revert to what was on the canvas before the paste.

### 4. Using Alpha Paste
1.  Click **Pick 🎨** and then tap the canvas, or hold **Opt/Alt** and click, to sample the color you want to make transparent (e.g. a green-screen background).
2.  Check the **Enable Alpha Paste** box.
3.  Adjust the **Tolerance** slider to control how close a color must be to the sampled key to be removed (higher tolerance also catches anti-aliased edges).
4.  Paste a new image. The sampled color is filtered out, letting the background show through.
5.  Disable Alpha Paste by unchecking the box, or clear the key by clicking the image with **Shift + Opt/Alt**.

## 🔧 Technical Details

*   **Pure JavaScript**: Built on the HTML5 Canvas API with image processing via [Jimp](https://github.com/jimp-dev/jimp), bundled with [Vite](https://vitejs.dev/) and tested with [Vitest](https://vitest.dev/).
*   **Secure Context**: Clipboard access requires a secure context (HTTPS or localhost).

### Development

```bash
npm install
npm run dev      # start the dev server (http://localhost:3000)
npm run build    # produce a production build in dist/
npm run preview  # serve the production build
npm test         # run the test suite
```

## ⚠️ Requirements
*   A modern web browser (Chrome, Edge, Safari, or Firefox).
