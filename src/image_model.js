import { CreateBitmap } from './bitmap.js'
import { CreateEmptyBitmap } from './bitmap.js'

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
        this.floatingLayer = null; // {original, x, y, w, h, rotation, flipH, flipV}
    }

    isEmpty() {
        return this.mainImage.isEmpty();
    }

    hasFloatingLayer() {
        return !!this.floatingLayer;
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

        this.floatingLayer = {
            original: pasted,
            x: this.selection.x,
            y: this.selection.y,
            w: this.selection.w,
            h: this.selection.h,
            rotation: 0,
            flipH: false,
            flipV: false,
        };
    }

    // Derives a fresh transformed copy from the floating layer's untouched original
    // bitmap every call, so repeated rotate/flip/resize while floating never compounds
    // lossy transforms onto a previously-transformed copy.
    getFloatingLayerPreview() {
        if (!this.floatingLayer) return null;
        const { original, w, h, rotation, flipH, flipV } = this.floatingLayer;
        const bmp = original.clone();

        const turns = ((rotation / 90) % 4 + 4) % 4;
        for (let i = 0; i < turns; i++) bmp.rotate_cw();

        if (flipH) bmp.flip_horizontal();
        if (flipV) bmp.flip_vertical();

        bmp.resize(w, h);

        if (this.selection && this.selection.type === 'ellipse') bmp.mask_ellipse();

        return bmp;
    }

    async manipulateSelection(type) {
        if (this.isEmpty() || !this.selection) return;

        if (this.hasFloatingLayer()) {
            this.applyFloatingTransform(type);
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

    // Updates the floating layer's transform params only - getFloatingLayerPreview()
    // re-derives from the untouched original bitmap every render, so this never
    // compounds lossy transforms the way the destructive path above would.
    applyFloatingTransform(type) {
        const fl = this.floatingLayer;
        if (type === 'rotateCW') fl.rotation = (fl.rotation + 90) % 360;
        else if (type === 'rotateCCW') fl.rotation = (fl.rotation + 270) % 360;
        else if (type === 'flipH') fl.flipH = !fl.flipH;
        else if (type === 'flipV') fl.flipV = !fl.flipV;
    }

    // Bakes the floating layer's current transform (and ellipse mask, if applicable) into
    // mainImage, then clears it. this.selection is updated to the floating layer's final
    // bounds so subsequent copy/manipulate operate on the region the content landed in.
    async commitFloatingLayer() {
        if (!this.floatingLayer) return;
        const transformed = this.getFloatingLayerPreview();
        this.mainImage.composite(transformed, this.floatingLayer.x, this.floatingLayer.y);
        this.selection = {
            type: this.selection ? this.selection.type : 'rect',
            x: this.floatingLayer.x,
            y: this.floatingLayer.y,
            w: this.floatingLayer.w,
            h: this.floatingLayer.h,
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
