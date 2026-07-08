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
    }

    isEmpty() {
        return this.mainImage.isEmpty();
    }

    notEmpty() {
        console.log(this.mainImage);
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

        pasted.resize(this.selection.w, this.selection.h);
        if (this.selection.type === 'ellipse') pasted.mask_ellipse();
        this.mainImage.composite(pasted, this.selection.x, this.selection.y);
        await this.saveHistory();
    }

    async manipulateSelection(type) {
        if (this.isEmpty() || !this.selection) return;
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

    async updateCopyBlob() {
        if (this.isEmpty() || !this.selection) return;
        const { x, y, w, h } = this.selection;
        const cropped = this.mainImage.clone().crop(x, y, w, h);
        if (this.selection.type === 'ellipse') cropped.mask_ellipse();
        const buffer = await cropped.getBufferAsync();
        this.pendingCopyBlob = new Blob([buffer], { type: 'image/png' });
    }
}
