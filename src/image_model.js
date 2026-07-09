import { CreateBitmap } from './bitmap.js'
import { CreateEmptyBitmap } from './bitmap.js'
import FloatingLayer from './floating_layer.js'

// Largest possible Euclidean RGB distance (black vs. white), used to map the
// 0-100 tolerance slider onto make_color_transparent's raw distance argument.
const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);

export function toleranceToDistance(tolerancePercent) {
    return (tolerancePercent / 100) * MAX_RGB_DISTANCE;
}

/**
 * MODEL: State management and byte-level manipulation via Jimp
 */
export default class ImageModel {
    constructor() {
        this.mainImage = CreateEmptyBitmap();
        this.history = [];
        this.redoStack = [];
        this.selection = null; // {type: 'rect'|'ellipse', x, y, w, h}
        this.shapeMode = 'rect'; // shape of the next selection drawn
        this.alphaKey = null; // {r, g, b}
        this.colorTolerance = 10; // 0-100, how close a color must be to alphaKey to match
        this.pendingCopyBlob = null;
        this.floatingLayer = null; // FloatingLayer instance
    }

    isEmpty() {
        return this.mainImage.isEmpty();
    }

    hasFloatingLayer() {
        return !!this.floatingLayer;
    }

    floatingBounds() {
        return this.floatingLayer.bounds();
    }

    floatingContains(coords) {
        return this.floatingLayer.contains(coords);
    }

    floatingShape() {
        return this.floatingLayer.shape;
    }

    beginFloatingResize(handle) {
        this.floatingLayer.beginResize(handle);
    }

    beginFloatingMove(coords) {
        this.floatingLayer.beginMove(coords);
    }

    applyFloatingDrag(coords, lockAspect) {
        this.floatingLayer.applyDrag(coords, lockAspect);
    }

    endFloatingDrag() {
        this.floatingLayer.endDrag();
    }

    nudgeFloating(dir, step) {
        this.floatingLayer.nudge(dir, step);
    }

    notEmpty() {
        return !this.isEmpty();
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

        if (this.alphaKey) {
            pasted.make_color_transparent(this.alphaKey, toleranceToDistance(this.colorTolerance));
        }

        this.floatingLayer = new FloatingLayer(pasted, {
            x: this.selection.x,
            y: this.selection.y,
            w: this.selection.w,
            h: this.selection.h,
        }, this.selection.type);
    }

    getFloatingLayerPreview() {
        if (!this.floatingLayer) return null;
        return this.floatingLayer.preview();
    }

    async manipulateSelection(type) {
        if (this.isEmpty() || !this.selection) return;

        if (this.hasFloatingLayer()) {
            const fl = this.floatingLayer;
            if (type === 'rotateCW') fl.rotate('cw');
            else if (type === 'rotateCCW') fl.rotate('ccw');
            else if (type === 'flipH') fl.flip('h');
            else if (type === 'flipV') fl.flip('v');
            return;
        }

        const { x, y, w, h } = this.selection;
        let part = this.mainImage.clone().crop(x, y, w, h);

        if (type === 'rotateCW') part.rotate_cw().resize(w, h);
        else if (type === 'rotateCCW') part.rotate_ccw().resize(w, h);
        else if (type === 'flipH') part.flip_horizontal();
        else if (type === 'flipV') part.flip_vertical();

        if (this.selection.type === 'ellipse') part.mask_ellipse();

        this.mainImage.composite(part, x, y);
        await this.saveHistory();
    }

    // Bakes the floating layer's current transform (and ellipse mask, if applicable) into
    // mainImage, then clears it. this.selection is updated to the floating layer's final
    // bounds so subsequent copy/manipulate operate on the region the content landed in.
    async commitFloatingLayer() {
        if (!this.floatingLayer) return;
        const transformed = this.floatingLayer.preview();
        const { x, y, w, h } = this.floatingLayer.bounds();
        this.mainImage.composite(transformed, x, y);
        this.selection = {
            type: this.selection ? this.selection.type : 'rect',
            x, y, w, h,
        };
        this.floatingLayer = null;
        await this.saveHistory();
    }

    // Discards the floating layer entirely - mainImage was never touched by it, so there's
    // nothing to restore and no history entry to create.
    cancelFloatingLayer() {
        this.floatingLayer = null;
    }

    async updateCopyBlob() {
        if (this.isEmpty() || !this.selection) return;
        const { x, y, w, h } = this.selection;
        const cropped = this.mainImage.clone().crop(x, y, w, h);
        if (this.selection.type === 'ellipse') cropped.mask_ellipse();
        const buffer = await cropped.getBufferAsync();
        this.pendingCopyBlob = new Blob([buffer], { type: 'image/png' });
    }
}
