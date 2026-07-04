/**
 * CONTROLLER: Orchestrates View and Model
 */
export default class ImageController {
    constructor(model, view) {
        this.model = model;
        this.view = view;
        this.isSelecting = false;
        this.startPos = { x: 0, y: 0 };

        this.initListeners();
    }

    initListeners() {
        window.addEventListener('paste', e => this.handlePaste(e));
        window.addEventListener('keydown', e => this.handleKeyDown(e));
        window.addEventListener('mousedown', e => this.handleMouseDown(e));
        window.addEventListener('mousemove', e => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());
        window.addEventListener('copy', e => this.handleCopy(e));
        document.getElementById('reset-btn')
            .addEventListener('click', e => this.handleReset(e));
        document.getElementById('transparency-toggle')
            .addEventListener('click', e => this.handleTransparencyToggle(e));
        document.getElementById('flip-horizontally-btn')
            .addEventListener('click', e => this.handleManipulate('flipH'));
        document.getElementById('flip-vertically-btn')
            .addEventListener('click', e => this.handleManipulate('flipV'));
        document.getElementById('rotate-btn')
            .addEventListener('click', e => this.handleManipulate('rotateCW'));
    }

    async handlePaste(e) {
        const item = Array.from(e.clipboardData.items)
                          .find(x => x.type.indexOf('image') !== -1 
                                      && x.kind === 'file');
        if (!item) return;

        const blob = item.getAsFile();
        const buffer = await blob.arrayBuffer();

        if (this.model.selection) {
            await this.model.pasteIntoSelection(buffer);
        } else {
            await this.model.createNew(buffer);
        }
        this.view.render(this.model.mainImage, this.model.selection);
    }

    handleCopy(e) {
        if (this.model.pendingCopyBlob) {
            const item = new ClipboardItem({ "image/png": this.model.pendingCopyBlob });
            navigator.clipboard.write([item]);
            e.preventDefault();
        }
    }

    handleKeyDown(e) {
        const key = e.key.toLowerCase();
        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;

        //Undo
        if (ctrl && key === 'z') {
            const img = shift ? this.model.redo() : this.model.undo();
            if (img) this.view.render(img, this.model.selection);
        }
        //Redo
        else if (ctrl && key === 'y') {
            const img = this.model.redo();
            if (img) this.view.render(img, this.model.selection);
        }
        //Select All
        else if (ctrl && key === 'a') {
            e.preventDefault();
            if (this.model.notEmpty()) {
                this.model.selection = { x: 0, y: 0, w: this.model.mainImage.bitmap.width, h: this.model.mainImage.bitmap.height };
                this.model.updateCopyBlob();
                this.view.drawSelection(this.model.selection);
            }
        }
        // Deselect
        else if (e.key === 'Escape') {
            this.model.selection = null;
            this.view.drawSelection(null);
        }
        else if (this.model.selection) {
            if (key === 'r') this.model.manipulateSelection(shift ? 'rotateCCW' : 'rotateCW');
            if (key === 'h' && !ctrl) this.model.manipulateSelection('flipH');
            if (key === 'v' && ! ctrl) this.model.manipulateSelection('flipV');
            this.view.render(this.model.mainImage, this.model.selection);
        }
    }

    getCanvasCoords(e) {
        const rect = this.view.imgCanvas.getBoundingClientRect();
        return {
            x: Math.floor((e.clientX - rect.left) / this.view.zoom),
            y: Math.floor((e.clientY - rect.top) / this.view.zoom)
        };
    }

    handleMouseDown(e) {
        if(this.model.isEmpty()) return;
        if (e.altKey) {
            const coords = this.getCanvasCoords(e);
            const idx = (coords.y * this.model.mainImage.bitmap.width + coords.x) * 4;
            const d = this.model.mainImage.bitmap.data;
            if (e.shiftKey) {
                this.model.alphaKey = null;
                console.log("Alpha blending disabled");
            } else {
                this.model.alphaKey = { r: d[idx], g: d[idx+1], b: d[idx+2] };
                console.log("Alpha key set to:", this.model.alphaKey);
            }
            this.view.setAlphaColor(this.model.alphaKey);
            return;
        }

        this.isSelecting = true;
        this.startPos = this.getCanvasCoords(e);
    }

    handleMouseMove(e) {
        if (!this.isSelecting) return;
        const current = this.getCanvasCoords(e);
        this.model.selection = {
            x: Math.min(this.startPos.x, current.x),
            y: Math.min(this.startPos.y, current.y),
            w: Math.abs(current.x - this.startPos.x),
            h: Math.abs(current.y - this.startPos.y)
        };
        this.view.drawSelection(this.model.selection);
    }

    async handleMouseUp() {
        this.isSelecting = false;
        if (this.model.selection && (this.model.selection.w === 0 || this.model.selection.h === 0)) {
            this.model.selection = null;
        }
        if (this.model.selection) {
            await this.model.updateCopyBlob();
        }
    }

    handleManipulate(type) {
        if (!this.model.selection) return;
        this.model.manipulateSelection(type);
        this.view.render(this.model.mainImage, this.model.selection);
    }

    handleReset() {
        this.model.clear();
        this.view.clearCanvas();
    }

    handleTransparencyToggle(e) {
        if (!this.model.alphaKey) {
            this.model.alphaKey = { r: 255, g: 255, b: 255 };
        } else {
            this.model.alphaKey = null;
        }
        this.view.setAlphaColor(this.model.alphaKey);
    }
}
