import { meetsThreshold, parseDebugConfig } from './error_bus.js';

const SELECTION_COLOR = '#00ff00';
const FLOATING_LAYER_COLOR = '#ff00ff'; // distinct from SELECTION_COLOR: signals "not yet committed"

const HANDLE_SIZE = 8; // canvas px at zoom 1
const TOUCH_HANDLE_SIZE = 36; // widened hit-test-only box for touch, visual size unchanged

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
    #lastOverlayRect = null; // canvas-pixel region drawn by the last drawSelection, for dirty-rect clears

    constructor(bus, debugConfig = parseDebugConfig(window.location.search)) {
        this.imgCanvas = document.getElementById('image-canvas');
        this.uiCanvas = document.getElementById('ui-layer');
        this.imgCtx = this.imgCanvas.getContext('2d');
        this.uiCtx = this.uiCanvas.getContext('2d');
        this.zoom = 1;

        this.toastContainer = document.getElementById('toast-container');
        this.debugConfig = debugConfig;
        bus.addEventListener('report', e => this.handleReport(e.detail));

        // Several controls exist twice - once in the desktop toolbar, once in the
        // mobile one - sharing a js- class so both stay in sync. The singular
        // properties below keep pointing at the desktop instance specifically, since
        // that's the one existing callers (and tests) read state back from.
        this.alphaColor = document.getElementById('alpha-color');
        this.alphaColors = Array.from(document.querySelectorAll('.js-alpha-color'));

        this.transparencyToggle = document.getElementById('transparency-toggle');
        this.transparencyToggles = Array.from(document.querySelectorAll('.js-transparency-toggle'));
        this.transparencyToggles.forEach(el => el.checked = false);

        this.toleranceSlider = document.getElementById('tolerance-slider');
        this.shapeSlider = document.getElementById('shape-slider');

        this.shapeToggle = document.getElementById('shape-toggle-btn');
        this.shapeToggles = Array.from(document.querySelectorAll('.js-shape-toggle'));

        this.alphaPickBtn = document.getElementById('alpha-pick-btn');
        this.alphaPickBtns = Array.from(document.querySelectorAll('.js-alpha-pick-btn'));

        // Shown over the blank canvas whenever it's empty, hidden as soon as an image
        // lands; the only cue telling a first-time user how to get started.
        this.emptyPrompt = document.getElementById('empty-prompt');
    }

    clearCanvas() {
        this.imgCtx.clearRect(0, 0, this.imgCanvas.width, this.imgCanvas.height);
        this.zoom = 1;
        this.resize(300, 150);
        this.setEmptyPrompt(true);
    }

    render(bitmap, selection, alphaKey, colorTolerance, shapeExponent) {
        if (!bitmap) return;
        this.setEmptyPrompt(false);
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
        // Clear only the region the previous overlay touched (unioned with the one we're
        // about to draw) rather than the whole ui-layer. The backing store is full image
        // resolution, so a full clearRect every pointer move is O(image) and janks
        // selection drags on large images / mobile; this keeps it O(selection).
        this.#clearOverlay(sel);

        if (!sel) return;

        if (sel.isFloating) {
            const bitmap = sel.preview(alphaKey, colorTolerance, shapeExponent);
            this.uiCtx.putImageData(this.toImageData(bitmap), sel.x, sel.y);
            this.strokeOutline(sel.type, sel.x, sel.y, sel.w, sel.h, FLOATING_LAYER_COLOR, shapeExponent);
        } else {
            this.strokeOutline(sel.type, sel.x, sel.y, sel.w, sel.h, SELECTION_COLOR, shapeExponent);
        }
        this.drawHandles(sel);
        this.#lastOverlayRect = this.#overlayDirtyRect(sel);
    }

    // Canvas-pixel region a selection's overlay occupies, padded to cover the handle
    // boxes and stroke width that extend past the bounds.
    #overlayDirtyRect(sel) {
        const pad = (HANDLE_SIZE + 4) / this.zoom;
        return { x: sel.x - pad, y: sel.y - pad, w: sel.w + pad * 2, h: sel.h + pad * 2 };
    }

    #clearOverlay(sel) {
        const rects = [this.#lastOverlayRect, sel && this.#overlayDirtyRect(sel)].filter(Boolean);
        // Nothing tracked and nothing to draw (first paint, or clearing an already-empty
        // overlay): fall back to a full clear so any untracked content is wiped.
        if (rects.length === 0) {
            this.uiCtx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
        } else {
            const minX = Math.min(...rects.map(r => r.x));
            const minY = Math.min(...rects.map(r => r.y));
            const maxX = Math.max(...rects.map(r => r.x + r.w));
            const maxY = Math.max(...rects.map(r => r.y + r.h));
            this.uiCtx.clearRect(minX, minY, maxX - minX, maxY - minY);
        }
        if (!sel) this.#lastOverlayRect = null;
    }

    // Bounding-box corners + edge midpoints, in canvas coordinates. Private: only
    // drawHandles and hitTestHandle need handle geometry.
    #getHandleRects(bounds, handleSize = HANDLE_SIZE) {
        const size = handleSize / this.zoom;
        return Object.entries(HANDLE_POSITIONS).map(([type, [px, py]]) => ({
            type,
            x: bounds.x + bounds.w * px - size / 2,
            y: bounds.y + bounds.h * py - size / 2,
            w: size,
            h: size,
        }));
    }

    // Used by the controller to hit-test a mousedown/touchstart against a floating
    // layer's handles. isTouch widens the hit rectangle for a fingertip-sized target;
    // the visual handle (drawHandles, HANDLE_SIZE) never changes.
    hitTestHandle(bounds, coords, isTouch = false) {
        const handleSize = isTouch ? TOUCH_HANDLE_SIZE : HANDLE_SIZE;
        const hit = this.#getHandleRects(bounds, handleSize)
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

    setEmptyPrompt(visible) {
        if (this.emptyPrompt) this.emptyPrompt.classList.toggle('hidden', !visible);
    }

    setShapeMode(mode) {
        const icon = mode === 'ellipse' ? '◯' : '⛶';
        this.shapeToggles.forEach(btn => {
            btn.textContent = icon;
            btn.classList.toggle('active', mode === 'ellipse');
        });
    }

    setAlphaPickArmed(armed) {
        this.alphaPickBtns.forEach(btn => btn.classList.toggle('active', armed));
    }

    setAlphaColor(color) {
        const newColor = color ?
          `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)` : 'transparent';

        this.alphaColors.forEach(el => el.style.background = newColor);
        this.transparencyToggles.forEach(el => el.checked = !!color);
    }

    handleReport({ level, message, detail }) {
        if (!meetsThreshold(level, this.debugConfig.logLevel)) return;
        this.showToast(level, message, detail);
    }

    showToast(level, message, detail) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${level}`;

        const text = document.createElement('span');
        text.className = 'toast-message';
        // At the lowest log_level threshold, a developer wants the raw error over the
        // friendly one-liner. stack_trace then appends the full stack on top of that
        // (rather than duplicating the raw message before it, since the stack already
        // starts with it).
        const showRaw = this.debugConfig.logLevel === 'debug' && detail;
        const baseMessage = showRaw ? this.rawMessage(detail) : message;
        text.textContent = this.debugConfig.stackTrace && detail
            ? (showRaw ? this.detailToText(detail) : `${baseMessage}\n${this.detailToText(detail)}`)
            : baseMessage;
        toast.appendChild(text);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.setAttribute('aria-label', 'Dismiss');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => toast.remove());
        toast.appendChild(closeBtn);

        this.toastContainer.appendChild(toast);

        if (this.debugConfig.stackTrace && detail) {
            console.error(detail);
        }
    }

    detailToText(detail) {
        if (detail instanceof Error) return detail.stack || detail.message;
        return String(detail);
    }

    rawMessage(detail) {
        if (detail instanceof Error) return detail.message;
        return String(detail);
    }
}
