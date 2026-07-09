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
        this.shapeSlider = document.getElementById('shape-slider');

        this.shapeToggle = document.getElementById('shape-toggle-btn');
    }

    clearCanvas() {
        this.imgCtx.clearRect(0, 0, this.imgCanvas.width, this.imgCanvas.height);
        this.zoom = 1;
        this.resize(300, 150);
    }

    render(bitmap, selection, alphaKey, colorTolerance, shapeExponent) {
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

        // ui-layer is pointer-events:none by default so a fresh selection drag reaches
        // image-canvas underneath; once a selection exists (marquee or floating) it needs
        // to catch its own handle/drag interactions instead.
        this.uiCanvas.style.pointerEvents = selection ? 'auto' : 'none';

        this.drawSelection(selection, alphaKey, colorTolerance, shapeExponent);
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

    drawSelection(sel, alphaKey, colorTolerance, shapeExponent = 2) {
        this.uiCtx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);

        if (!sel) return;

        if (sel.isFloating) {
            const bitmap = sel.preview(alphaKey, colorTolerance, shapeExponent);
            this.uiCtx.putImageData(this.toImageData(bitmap), sel.x, sel.y);
            this.strokeOutline(sel.type, sel.x, sel.y, sel.w, sel.h, FLOATING_LAYER_COLOR, shapeExponent);
        } else {
            this.strokeOutline(sel.type, sel.x, sel.y, sel.w, sel.h, SELECTION_COLOR, shapeExponent);
        }
        this.drawHandles(sel);
    }

    // Bounding-box corners + edge midpoints, in canvas coordinates. Private: only
    // drawHandles and hitTestHandle need handle geometry.
    #getHandleRects(bounds) {
        const size = HANDLE_SIZE / this.zoom;
        return Object.entries(HANDLE_POSITIONS).map(([type, [px, py]]) => ({
            type,
            x: bounds.x + bounds.w * px - size / 2,
            y: bounds.y + bounds.h * py - size / 2,
            w: size,
            h: size,
        }));
    }

    // Used by the controller to hit-test a mousedown against a floating layer's handles.
    hitTestHandle(bounds, coords) {
        const hit = this.#getHandleRects(bounds)
            .find(r => coords.x >= r.x && coords.x < r.x + r.w && coords.y >= r.y && coords.y < r.y + r.h);
        return hit ? hit.type : null;
    }

    drawHandles(floating) {
        this.uiCtx.fillStyle = '#fff';
        this.uiCtx.strokeStyle = '#000';
        this.uiCtx.setLineDash([]);
        this.uiCtx.lineWidth = 1 / this.zoom;
        for (const r of this.#getHandleRects(floating)) {
            this.uiCtx.fillRect(r.x, r.y, r.w, r.h);
            this.uiCtx.strokeRect(r.x, r.y, r.w, r.h);
        }
    }

    strokeOutline(type, x, y, w, h, color, shapeExponent = 2) {
        this.uiCtx.strokeStyle = color;
        // Adjust line width based on zoom so it always looks "1px" or "2px"
        this.uiCtx.lineWidth = 2 / this.zoom;
        this.uiCtx.setLineDash([5 / this.zoom, 5 / this.zoom]);
        if (type === 'ellipse') {
            this.uiCtx.beginPath();
            this.#traceSuperellipse(x, y, w, h, shapeExponent);
            this.uiCtx.stroke();
        } else {
            this.uiCtx.strokeRect(x, y, w, h);
        }
    }

    // Canvas has no native superellipse primitive, so the outline is sampled from the
    // Lamé parametric form matching mask_ellipse's implicit |nx|^n + |ny|^n > 1 - at
    // shapeExponent=2 this reduces exactly to the ctx.ellipse() path it replaced.
    #traceSuperellipse(x, y, w, h, shapeExponent) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const rx = w / 2;
        const ry = h / 2;
        const k = 2 / shapeExponent;
        const steps = 90;
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * Math.PI * 2;
            const cosT = Math.cos(t);
            const sinT = Math.sin(t);
            const px = cx + rx * Math.sign(cosT) * Math.abs(cosT) ** k;
            const py = cy + ry * Math.sign(sinT) * Math.abs(sinT) ** k;
            if (i === 0) this.uiCtx.moveTo(px, py);
            else this.uiCtx.lineTo(px, py);
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
    }
}
