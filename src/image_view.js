const SELECTION_COLOR = '#00ff00';
const FLOATING_LAYER_COLOR = '#ff00ff'; // distinct from SELECTION_COLOR: signals "not yet committed"

const HANDLE_SIZE = 8; // canvas px at zoom 1

// Handle name -> normalized position within the bounding box (0=start edge, 1=end edge, 0.5=mid).
const HANDLE_POSITIONS = {
    nw: [0, 0], n: [0.5, 0], ne: [1, 0],
    w: [0, 0.5],             e: [1, 0.5],
    sw: [0, 1], s: [0.5, 1], se: [1, 1],
};

/**
 * VIEW: DOM/Canvas interaction
 */
export default class ImageView {
    constructor() {
        this.imgCanvas = document.getElementById('image-canvas');
        this.uiCanvas = document.getElementById('ui-layer');
        this.imgCtx = this.imgCanvas.getContext('2d');
        this.uiCtx = this.uiCanvas.getContext('2d');
        this.zoom = 1;

        this.alphaColor = document.getElementById('alpha-color');
        this.transparencyToggle = document.getElementById('transparency-toggle');
        this.transparencyToggle.checked = false;
        this.toleranceSlider = document.getElementById('tolerance-slider');
        this.toleranceSlider.disabled = true;

        this.shapeToggle = document.getElementById('shape-toggle-btn');
    }

    clearCanvas() {
        this.imgCtx.clearRect(0, 0, this.imgCanvas.width, this.imgCanvas.height);
        this.zoom = 1;
        this.resize(300, 150);
    }

    render(bitmap, selection, floating = null) {
        if (!bitmap) return;
        const width = bitmap.width;
        const height = bitmap.height;

        // Auto zoom logic
        const margin = 50;
        const scaleW = (window.innerWidth - margin) / width;
        const scaleH = (window.innerHeight - margin) / height;
        this.zoom = Math.min(scaleW, scaleH);

        this.resize(width, height);

        this.imgCtx.putImageData(this.toImageData(bitmap), 0, 0);

        // ui-layer is pointer-events:none by default so normal selection drags reach
        // image-canvas underneath; while a floating layer is active it needs to catch
        // its own drag/handle interactions instead.
        this.uiCanvas.style.pointerEvents = floating ? 'auto' : 'none';

        this.drawSelection(selection, floating);
    }

    toImageData(bitmap) {
        const arr = new Uint8ClampedArray(bitmap.data());
        return new ImageData(arr, bitmap.width, bitmap.height);
    }

    resize(width, height) {
        this.imgCanvas.width = width;
        this.imgCanvas.height = height;
        this.imgCanvas.style.width = (width * this.zoom) + 'px';
        this.imgCanvas.style.height = (height * this.zoom) + 'px';

        this.uiCanvas.width = width;
        this.uiCanvas.height = height;
        this.uiCanvas.style.width = (width * this.zoom) + 'px';
        this.uiCanvas.style.height = (height * this.zoom) + 'px';
    }

    drawSelection(sel, floating = null) {
        this.uiCtx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);

        if (floating) {
            this.uiCtx.putImageData(this.toImageData(floating.bitmap), floating.x, floating.y);
            this.strokeOutline(floating.shape, floating.x, floating.y, floating.w, floating.h, FLOATING_LAYER_COLOR);
            this.drawHandles(floating);
            return;
        }

        if (!sel) return;
        this.strokeOutline(sel.type, sel.x, sel.y, sel.w, sel.h, SELECTION_COLOR);
    }

    // Bounding-box corners + edge midpoints, in canvas coordinates. Used both to render the
    // handles and (by the controller) to hit-test mousedown against them.
    getHandleRects(bounds) {
        const size = HANDLE_SIZE / this.zoom;
        return Object.entries(HANDLE_POSITIONS).map(([type, [px, py]]) => ({
            type,
            x: bounds.x + bounds.w * px - size / 2,
            y: bounds.y + bounds.h * py - size / 2,
            w: size,
            h: size,
        }));
    }

    drawHandles(floating) {
        this.uiCtx.fillStyle = '#fff';
        this.uiCtx.strokeStyle = '#000';
        this.uiCtx.setLineDash([]);
        this.uiCtx.lineWidth = 1 / this.zoom;
        for (const r of this.getHandleRects(floating)) {
            this.uiCtx.fillRect(r.x, r.y, r.w, r.h);
            this.uiCtx.strokeRect(r.x, r.y, r.w, r.h);
        }
    }

    strokeOutline(type, x, y, w, h, color) {
        this.uiCtx.strokeStyle = color;
        // Adjust line width based on zoom so it always looks "1px" or "2px"
        this.uiCtx.lineWidth = 2 / this.zoom;
        this.uiCtx.setLineDash([5 / this.zoom, 5 / this.zoom]);
        if (type === 'ellipse') {
            this.uiCtx.beginPath();
            this.uiCtx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            this.uiCtx.stroke();
        } else {
            this.uiCtx.strokeRect(x, y, w, h);
        }
    }

    setShapeMode(mode) {
        this.shapeToggle.textContent = mode === 'ellipse' ? 'Shape: ⬭' : 'Shape: ▭';
        this.shapeToggle.classList.toggle('active', mode === 'ellipse');
    }

    setAlphaColor(color) {
        const newColor = color ? 
          `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)` : 'transparent';

        this.alphaColor.style.background = newColor;
        this.transparencyToggle.checked = !!color;
        this.toleranceSlider.disabled = !color;
    }
}
