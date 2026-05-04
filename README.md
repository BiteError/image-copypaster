# Image CopyPaster

A lightweight, browser-based image editor. It makes image handling as easy as text. If you find yourself constantly taking screenshots just to flip them or move them into a specific area, this is for you. Select your target, paste your image, and use basic tools to get the look right. No bloated menus—just the tools you need to get the job done.

## 🚀 Key Features

*   **Fast Workflow**: Initialize a workspace instantly using the "Paste" shortcut which pulls directly from your system clipboard.
*   **Targeted Manipulation**: Paste images into specific selected areas. The incoming image automatically resizes to fit the selection.
*   **Chroma Key (Color-to-Alpha)**: Sample any color from the current image to act as a transparency key. When "Alpha Paste" is enabled, that color will be removed from future pasted images.
*   **Smart Auto-Zoom**: Automatically fits large images to the browser window while maintaining the original resolution for editing.
*   **Non-Destructive UI**: The selection borders (marching ants) maintain a consistent visual thickness regardless of the zoom level.
*   **Symmetry Tools**: Flip selections vertically or horizontally without affecting the rest of the canvas.

## ⌨️ Hotkeys

The application supports both **macOS (⌘)** and **Windows/Linux (Ctrl)** shortcuts.

| Shortcut | Action |
| :--- | :--- |
| **Cmd/Ctrl + V** | Paste image from clipboard into the selected area. |
| **Cmd/Ctrl + C** | Copy the currently selected area back to the clipboard. |
| **Cmd/Ctrl + A** | Select the entire image area. |
| **V** | Flip vertically selected area. |
| **H** | Flip horizontally selected area. |
| **Drag Mouse** | Create a custom rectangular selection. |

## 🛠 How to Use

### 1. Starting a Project
press the "Paste" shortcut. The browser will request clipboard permission if necessary. Once granted, the image in your clipboard will become the main canvas.

### 2. Manipulating Areas
Use your mouse to drag a box over an area or select with **Cmd/Ctrl + A** the whole area. You can now:
*   Click **Flip H** or **Flip V** to mirror that specific section.
*   Press **Cmd/Ctrl + C** to copy selected area into your clipboard.
*   Press **Cmd/Ctrl + V** to replace that section with a new image from your clipboard.

### 3. Using Transparency
1.  Click **Pick Opacity Color**.
2.  Click a pixel on your image that represents the color you want to make transparent (e.g., a green screen background).
3.  Check the **Enable Alpha Paste** box.
4.  Paste a new image. The sampled color will be filtered out, allowing the background to show through.

## 🔧 Technical Details

*   **Pure JavaScript**: Built using the HTML5 Canvas API and the modern `navigator.clipboard` API.
*   **Secure Context**: This application requires a secure context (HTTPS or Localhost) to access clipboard functions.
*   **Performance**: Uses `createImageBitmap` for high-performance image decoding and `willReadFrequently` optimization for pixel manipulation.

## ⚠️ Requirements
*   A modern web browser (Chrome, Edge, Safari, or Firefox).
*   For clipboard features to work, the app must be served via `http://localhost` or `https://`. Opening the file directly via `file://` may restrict clipboard/directory access in some browsers.
