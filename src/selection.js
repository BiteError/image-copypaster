import { toleranceToDistance } from './bitmap.js'

// Handle name -> which axes it drives, and which side of the anchor it starts on
// (-1/+1). Used to detect when a drag has crossed past the anchor (the opposite,
// fixed corner/edge), which means the selection should mirror through.
const HANDLE_GEOMETRY = {
    nw: { hasH: true, signH: -1, hasV: true, signV: -1 },
    n: { hasH: false, hasV: true, signV: -1 },
    ne: { hasH: true, signH: 1, hasV: true, signV: -1 },
    e: { hasH: true, signH: 1, hasV: false },
    se: { hasH: true, signH: 1, hasV: true, signV: 1 },
    s: { hasH: false, hasV: true, signV: 1 },
    sw: { hasH: true, signH: -1, hasV: true, signV: 1 },
    w: { hasH: true, signH: -1, hasV: false },
};

/**
 * MODEL (internal seam of ImageModel): a Selection on the Canvas. Pure geometry
 * (`marquee`) until `original` is loaded, at which point it also owns a non-destructive
 * transform (`floating`) - see CONTEXT.md. Depends only on Bitmap.
 */
export default class Selection {
    constructor({ x, y, w, h, type }) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.type = type;
        this.original = null;
        this.rotation = 0;
        this.flipH = false;
        this.flipV = false;
        this.#gesture = null;
        this.#snapshot = null;
    }

    #gesture;
    #snapshot;

    get isFloating() {
        return !!this.original;
    }

    bounds() {
        return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    contains(coords) {
        return coords.x >= this.x && coords.x <= this.x + this.w
            && coords.y >= this.y && coords.y <= this.y + this.h;
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }

    nudge(dir, step) {
        if (dir === 'up') this.y -= step;
        else if (dir === 'down') this.y += step;
        else if (dir === 'left') this.x -= step;
        else if (dir === 'right') this.x += step;
    }

    rotate(dir) {
        this.rotation = (this.rotation + (dir === 'ccw' ? 270 : 90)) % 360;
    }

    flip(axis) {
        if (axis === 'h') this.flipH = !this.flipH;
        else if (axis === 'v') this.flipV = !this.flipV;
    }

    beginResize(handleName) {
        const geo = HANDLE_GEOMETRY[handleName];
        this.#gesture = {
            mode: 'resize',
            geo,
            anchor: {
                x: geo.hasH ? (geo.signH === -1 ? this.x + this.w : this.x) : this.x,
                y: geo.hasV ? (geo.signV === -1 ? this.y + this.h : this.y) : this.y,
            },
            startW: this.w,
            startH: this.h,
            startFlipH: this.flipH,
            startFlipV: this.flipV,
        };
    }

    beginMove(coords) {
        this.#gesture = { mode: 'move', start: coords, startX: this.x, startY: this.y };
    }

    applyDrag(coords, lockAspect) {
        if (!this.#gesture) return;
        if (this.#gesture.mode === 'move') {
            this.x = this.#gesture.startX + (coords.x - this.#gesture.start.x);
            this.y = this.#gesture.startY + (coords.y - this.#gesture.start.y);
            return;
        }
        this.#applyResize(coords, lockAspect);
    }

    #applyResize(coords, lockAspect) {
        const { geo, anchor, startW, startH } = this.#gesture;

        let w = geo.hasH ? Math.abs(coords.x - anchor.x) : startW;
        let h = geo.hasV ? Math.abs(coords.y - anchor.y) : startH;

        if (lockAspect && geo.hasH && geo.hasV && startW && startH) {
            const ratio = startW / startH;
            if (w / ratio >= h) h = w / ratio;
            else w = h * ratio;
        }

        if (geo.hasH) {
            const side = coords.x < anchor.x ? -1 : 1;
            this.flipH = this.#gesture.startFlipH !== (side !== geo.signH);
            this.w = w;
            this.x = side === -1 ? anchor.x - w : anchor.x;
        }

        if (geo.hasV) {
            const side = coords.y < anchor.y ? -1 : 1;
            this.flipV = this.#gesture.startFlipV !== (side !== geo.signV);
            this.h = h;
            this.y = side === -1 ? anchor.y - h : anchor.y;
        }
    }

    endDrag() {
        this.#gesture = null;
    }

    // Clears `original`/rotation/flip back to their construction-time defaults.
    #resetTransform() {
        this.original = null;
        this.rotation = 0;
        this.flipH = false;
        this.flipV = false;
    }

    // Enters floating with `original`, without snapshotting bounds/shape for a later
    // Cancel. For callers that immediately bake and exit - the one-shot marquee
    // rotate/flip/resize, where ImageModel composites and calls exitFloating() right
    // after - and so never offer a Cancel to restore.
    enterTransientFloating(original) {
        this.#resetTransform();
        this.original = original;
    }

    // Entering floating for a real Paste: snapshots the pre-paste bounds/shape first, so
    // Cancel can restore them - this is the same instance being mutated in place, not a
    // separate object that Cancel could just discard.
    enterFloating(original) {
        this.#snapshot = { x: this.x, y: this.y, w: this.w, h: this.h, type: this.type };
        this.enterTransientFloating(original);
    }

    // Discards the floating state, restoring the bounds/shape snapshotted by enterFloating.
    cancelFloating() {
        Object.assign(this, this.#snapshot);
        this.#snapshot = null;
        this.#resetTransform();
    }

    // Clears floating state at the current (possibly moved/resized) bounds - used once
    // ImageModel has baked preview() into mainImage. No snapshot restore: these bounds
    // are the final ones, not something to revert.
    exitFloating() {
        this.#resetTransform();
        this.#snapshot = null;
    }

    // Derives a fresh transformed copy from the untouched original bitmap every call,
    // so repeated rotate/flip/resize/re-keying while floating never compounds lossy
    // transforms onto a previously-transformed copy. Color-keying happens first, at
    // native resolution, so tolerance matching isn't skewed by resize interpolation.
    preview(alphaKey = null, colorTolerance = 0) {
        const bmp = this.original.clone();

        if (alphaKey) bmp.make_color_transparent(alphaKey, toleranceToDistance(colorTolerance));

        const turns = ((this.rotation / 90) % 4 + 4) % 4;
        for (let i = 0; i < turns; i++) bmp.rotate_cw();

        if (this.flipH) bmp.flip_horizontal();
        if (this.flipV) bmp.flip_vertical();

        bmp.resize(this.w, this.h);

        if (this.type === 'ellipse') bmp.mask_ellipse();

        return bmp;
    }
}
