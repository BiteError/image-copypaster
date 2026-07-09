import { CreateBitmap } from './bitmap.js'
import { CreateEmptyBitmap } from './bitmap.js'
import Selection from './selection.js'

/**
 * MODEL: State management and byte-level manipulation via Jimp
 */
export default class ImageModel {
    constructor() {
        this.mainImage = CreateEmptyBitmap();
        this.history = [];
        this.redoStack = [];
        this.selection = null; // Selection instance: marquee (no `original`) or floating
        this.shapeMode = 'rect'; // shape of the next selection drawn
        this.alphaKey = null; // {r, g, b}
        this.colorTolerance = 10; // 0-100, how close a color must be to alphaKey to match
        this.shapeExponent = 2; // 1 (diamond) - 8 (rounded rect), 2 is a plain ellipse
        this.pendingCopyBlob = null;
    }

    isEmpty() {
        return this.mainImage.isEmpty();
    }

    notEmpty() {
        return !this.isEmpty();
    }

    hasFloatingLayer() {
        return !!this.selection && this.selection.isFloating;
    }

    async saveHistory() {
        const clone = this.mainImage.clone();
        this.history.push(clone);
        if (this.history.length > 6) this.history.shift(); // Keep 5 + current
        this.redoStack = [];
    }

    undo() {
        if (this.history.length < 2) return null;
        this.redoStack.push(this.history.pop());
        this.mainImage = this.history[this.history.length - 1].clone();
        return this.mainImage;
    }

    redo() {
        if (this.redoStack.length === 0) return null;
        const img = this.redoStack.pop();
        this.history.push(img);
        this.mainImage = img.clone();
        return this.mainImage;
    }

    async createNew(buffer) {
        this.mainImage = await CreateBitmap(buffer);
        this.selection = null;
        await this.saveHistory();
    }

    async clear() {
        this.mainImage = CreateEmptyBitmap();
        this.selection = null;
        await this.saveHistory();
    }

    async pasteIntoSelection(buffer) {
        if (this.isEmpty() || !this.selection) return;
        const pasted = await CreateBitmap(buffer);
        this.selection.enterFloating(pasted);
    }

    // Starts a fresh full-Canvas rectangular selection (Select All). No-op on an empty
    // Canvas, since there's nothing to select.
    selectAll() {
        if (this.isEmpty()) return;
        this.selection = new Selection({ type: 'rect', x: 0, y: 0, w: this.mainImage.width, h: this.mainImage.height });
    }

    // Starts a fresh selection from raw drag geometry (already normalized to a
    // non-negative x/y/w/h by the Controller from two dragged cursor points), shaped by
    // the current shapeMode.
    startDragSelection({ x, y, w, h }) {
        this.selection = new Selection({ type: this.shapeMode, x, y, w, h });
    }

    // Changes the current selection's Shape in place. No-op without an active selection.
    setSelectionShape(shapeMode) {
        if (!this.selection) return;
        this.selection.type = shapeMode;
    }

    // marquee: crops fresh pixels, applies the transform once, and bakes them straight
    // back into mainImage - one history entry per press, no persistent rotation counter.
    // floating: the transform just accumulates on the selection in memory; nothing
    // touches mainImage/history until an explicit commit.
    async manipulateSelection(type) {
        if (this.isEmpty() || !this.selection) return;

        if (this.selection.isFloating) {
            this.#applyTransform(type);
            return;
        }

        const { x, y, w, h } = this.selection;
        const cropped = this.mainImage.clone().crop(x, y, w, h);
        this.selection.enterTransientFloating(cropped);
        this.#applyTransform(type);
        this.mainImage.composite(this.selection.preview(), x, y);
        this.selection.exitFloating();
        await this.saveHistory();
    }

    #applyTransform(type) {
        if (type === 'rotateCW') this.selection.rotate('cw');
        else if (type === 'rotateCCW') this.selection.rotate('ccw');
        else if (type === 'flipH') this.selection.flip('h');
        else if (type === 'flipV') this.selection.flip('v');
    }

    // Bakes the floating selection's current transform (and ellipse mask, if applicable)
    // into mainImage, then clears it. this.selection stays at its final bounds/shape, so
    // subsequent copy/manipulate operate on the region the content landed in.
    async commitFloatingLayer() {
        if (!this.hasFloatingLayer()) return;
        const transformed = this.selection.preview(this.alphaKey, this.colorTolerance, this.shapeExponent);
        const { x, y, w, h } = this.selection.bounds();
        this.mainImage.composite(transformed, x, y);
        this.selection.exitFloating();
        await this.saveHistory();
    }

    // Discards the floating selection, restoring the pre-paste bounds/shape - mainImage
    // was never touched by it, so there's nothing to restore there and no history entry.
    cancelFloatingLayer() {
        if (!this.hasFloatingLayer()) return;
        this.selection.cancelFloating();
    }

    async updateCopyBlob() {
        if (this.isEmpty() || !this.selection) return;
        const { x, y, w, h } = this.selection;
        const cropped = this.mainImage.clone().crop(x, y, w, h);
        if (this.selection.type === 'ellipse') cropped.mask_ellipse(this.shapeExponent);
        const buffer = await cropped.getBufferAsync();
        this.pendingCopyBlob = new Blob([buffer], { type: 'image/png' });
    }
}
