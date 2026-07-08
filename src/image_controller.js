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
        this.view.setShapeMode(this.model.shapeMode);
    }

    render_view(){
        this.view.render(this.model.mainImage, this.model.selection);
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
        document.getElementById('tolerance-slider')
            .addEventListener('input', e => this.handleToleranceChange(e));
        document.getElementById('flip-horizontally-btn')
            .addEventListener('click', e => this.handleManipulate('flipH'));
        document.getElementById('flip-vertically-btn')
            .addEventListener('click', e => this.handleManipulate('flipV'));
        document.getElementById('rotate-btn')
            .addEventListener('click', e => this.handleManipulate('rotateCW'));
        document.getElementById('shape-toggle-btn')
            .addEventListener('click', e => this.toggleShapeMode());
        document.getElementById('help-btn')
            .addEventListener('click', e => this.toggleHelpPanel());
        window.addEventListener('click', e => this.handleOutsideHelpClick(e));
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
        this.render_view();
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
            if (img) this.render_view();
        }
        //Redo
        else if (ctrl && key === 'y') {
            const img = this.model.redo();
            if (img) this.render_view();
        }
        //Select All
        else if (ctrl && key === 'a') {
            e.preventDefault();
            if (this.model.notEmpty()) {
                this.model.selection = { type: 'rect', x: 0, y: 0, w: this.model.mainImage.width, h: this.model.mainImage.height };
                this.model.updateCopyBlob();
                this.view.drawSelection(this.model.selection);
            }
        }
        // Deselect
        else if (e.key === 'Escape') {
            this.isSelecting = false;
            this.model.selection = null;
            this.view.drawSelection(null);
            this.closeHelpPanel();
        }
        // Toggle selection shape
        else if (key === ' ') {
            e.preventDefault();
            this.toggleShapeMode();
        }
        // Toggle keyboard shortcuts panel
        else if (e.key === '?') {
            e.preventDefault();
            this.toggleHelpPanel();
        }
        else if (this.model.selection) {
            let direction = null;
            if (key === 'r' && !ctrl) direction = shift ? 'rotateCCW' : 'rotateCW';
            if (key === 'h' && !ctrl) direction = 'flipH';
            if (key === 'v' && !ctrl) direction = 'flipV';

            if (direction){
                this.model.manipulateSelection(direction);
                this.render_view();
            }
        }
    }

    toggleHelpPanel() {
        document.getElementById('help-panel').classList.toggle('hidden');
    }

    closeHelpPanel() {
        document.getElementById('help-panel').classList.add('hidden');
    }

    handleOutsideHelpClick(e) {
        const panel = document.getElementById('help-panel');
        const helpBtn = document.getElementById('help-btn');
        if (panel.classList.contains('hidden')) return;
        if (panel.contains(e.target) || helpBtn.contains(e.target)) return;
        this.closeHelpPanel();
    }

    toggleShapeMode() {
        this.model.shapeMode = this.model.shapeMode === 'ellipse' ? 'rect' : 'ellipse';
        if (this.isSelecting && this.model.selection) {
            this.model.selection = { ...this.model.selection, type: this.model.shapeMode };
            this.view.drawSelection(this.model.selection);
        }
        this.view.setShapeMode(this.model.shapeMode);
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

        if (!e.altKey){
            this.isSelecting = true;
            this.startPos = this.getCanvasCoords(e);
            return;
        }

        if (e.shiftKey) {
            this.model.alphaKey = null;
            console.log("Alpha blending disabled");
        } else {
            const coords = this.getCanvasCoords(e);
            this.model.alphaKey = this.model.mainImage.pixel_color(coords.x, coords.y);
            console.log("Alpha key set to:", this.model.alphaKey);
        }
        this.view.setAlphaColor(this.model.alphaKey);
    }

    handleMouseMove(e) {
        if (!this.isSelecting) return;
        
        const current = this.getCanvasCoords(e);
        this.model.selection = {
            type: this.model.shapeMode,
            x: Math.min(this.startPos.x, current.x),
            y: Math.min(this.startPos.y, current.y),
            w: Math.abs(current.x - this.startPos.x),
            h: Math.abs(current.y - this.startPos.y)
        };
        this.view.drawSelection(this.model.selection);
    }

    async handleMouseUp() {
        if (!this.isSelecting) return;
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
        this.render_view();
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

    handleToleranceChange(e) {
        this.model.colorTolerance = Number(e.target.value);
    }
}
