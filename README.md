# Image CopyPaster

A lightweight, browser-based image editor. It makes image handling as easy as text. If you find yourself constantly taking screenshots just to flip them or move them into a specific area, this is for you. Select your target, paste your image, and use basic tools to get the look right. No bloated menus—just the tools you need to get the job done.

## 🚀 Key Features

*   **Fast Workflow**: Initialize a workspace instantly using the "Paste" shortcut which pulls directly from your system clipboard.
*   **Floating Paste Layer**: Pasting into a selection no longer bakes in immediately — the incoming image lands as a movable, resizable floating layer. Reposition it, drag a handle to resize (hold Shift to lock aspect ratio), and flip/rotate it freely with no quality loss, then press **Enter** to commit it into the canvas or **Escape** to cancel.
*   **Chroma Key (Color-to-Alpha)**: Sample any color from the current image to act as a transparency key. When "Alpha Paste" is enabled, that color will be removed from future pasted images.
*   **Smart Auto-Zoom**: Automatically fits large images to the browser window while maintaining the original resolution for editing.
*   **Non-Destructive UI**: The selection borders (marching ants) maintain a consistent visual thickness regardless of the zoom level.
*   **Symmetry Tools**: Flip selections vertically or horizontally without affecting the rest of the canvas.
*   **Switchable Selection Shape**: Toggle a selection between rectangle and ellipse with **Space** or the toolbar's shape button — works mid-drag or on an already-drawn selection.

## ⌨️ Hotkeys

The application supports both **macOS (⌘)** and **Windows/Linux (Ctrl)** shortcuts.

| Shortcut | Action |
| :--- | :--- |
| **Cmd/Ctrl + V** | Paste image from clipboard into the selected area, as a floating layer if a selection is active. Pasting again while a floating layer is active commits it first, then starts a new one. |
| **Cmd/Ctrl + C** | Copy the currently selected area back to the clipboard (commits any active floating layer first). |
| **Cmd/Ctrl + A** | Select the entire image area. |
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
| **Opt/Alt + Click** | Select the alpha color. |
| **Shift + Opt/Alt + Click** | Disable the alpha color. |

## 🛠 How to Use

### 1. Starting a Project
press the "Paste" shortcut. The browser will request clipboard permission if necessary. Once granted, the image in your clipboard will become the main canvas.

### 2. Manipulating Areas
Use your mouse to drag a box over an area or select with **Cmd/Ctrl + A** the whole area. You can now:
*   Press **Cmd/Ctrl + C** to copy selected area into your clipboard.
*   Press **Cmd/Ctrl + V** to paste a new image from your clipboard into that section.
*   Press **H / V / R** to transform selected area.
*   Press **Space**, or click the toolbar's shape button, to switch the selection between rectangle and ellipse — this affects the selection you already have, not just the next one you draw.

### 3. Adjusting a Floating Paste
Pasting into an active selection doesn't land on the canvas right away — it becomes a floating layer you can adjust:
*   Drag inside the floating layer to move it.
*   Drag one of its eight handles to resize it (hold **Shift** to lock the aspect ratio).
*   Use the arrow keys to nudge it by 1px, or **Shift + arrow keys** for 10px.
*   Press **H / V / R** to flip or rotate it — repeatable with no quality loss since nothing is baked in yet.
*   Press **Enter**, click outside the floating layer, or start a new selection/paste/tool to commit it into the canvas.
*   Press **Escape** to discard it and revert to what was on the canvas before the paste.

### 4. Using Alpha Paste
1.  While holding **Opt/Alt** click a pixel on your image that represents the color you want to make transparent (e.g., a green screen background).
2.  Check the **Enable Alpha Paste** box.
3.  Paste a new image. The sampled color will be filtered out, allowing the background to show through.
4.  Disable Alpha Paste clicking on checkbox or clicking on image holding the **Shift+Opt/ALt**.

## 🔧 Technical Details

*   **Pure JavaScript**: Built using the HTML5 Canvas API and [Jimp](https://github.com/jimp-dev/jimp).
*   **Secure Context**: This application requires a secure context (HTTPS or Localhost) to access clipboard functions.

## ⚠️ Requirements
*   A modern web browser (Chrome, Edge, Safari, or Firefox).
