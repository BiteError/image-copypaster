/**
 * CONTROLLER: Orchestrates View and Model
 */
export default class ImageController {
    constructor(model, view) {
        this.model = model;
        this.view = view;
        this.isSelecting = false;
        this.startPos = { x: 0, y: 0 };
        this.selectionDrag = null; // truthy while dragging a selection's move/resize gesture
        this.toolbar = document.getElementById('toolbar');

        this.initListeners();
        this.view.setShapeMode(this.model.shapeMode);
    }

    render_view(){
        if(this.model.mainImage.isEmpty()) return;
        this.view.render(this.model.mainImage, this.model.selection, this.model.alphaKey, this.model.colorTolerance);
    }

    async commitFloating() {
        if (!this.model.hasFloatingLayer()) return;
        await this.model.commitFloatingLayer();
        this.render_view();
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

        if (this.model.hasFloatingLayer()) {
            await this.model.commitFloatingLayer();
        }

        if (this.model.selection) {
            await this.model.pasteIntoSelection(buffer);
        } else {
            await this.model.createNew(buffer);
        }
        this.render_view();
    }

    async handleCopy(e) {
        if (this.model.hasFloatingLayer()) {
            // Copy must never read the floating layer's transformed pixels directly -
            // commit first so it reads the same composited mainImage everything else sees.
            e.preventDefault();
            await this.commitFloating();
            await this.model.updateCopyBlob();
        }

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

        // Suppress undo/redo while a floating layer is active - the history stack stays
        // untouched until commit; back out of an uncommitted paste with Escape instead.
        if (this.model.hasFloatingLayer() && ctrl && (key === 'z' || key === 'y')) {
            e.preventDefault();
            return;
        }

        //Undo
        if (ctrl && key === 'z') {
            e.preventDefault();
            const img = shift ? this.model.redo() : this.model.undo();
            if (img) this.render_view();
        }
        //Redo
        else if (ctrl && key === 'y') {
            e.preventDefault();
            const img = this.model.redo();
            if (img) this.render_view();
        }
        //Select All
        else if (ctrl && key === 'a') {
            e.preventDefault();
            if (this.model.notEmpty()) {
                this.model.selectAll();
                this.model.updateCopyBlob();
                this.view.drawSelection(this.model.selection);
            }
        }
        // Cancel the floating layer
        else if (e.key === 'Escape' && this.model.hasFloatingLayer()) {
            this.model.cancelFloatingLayer();
            this.render_view();
            this.closeHelpPanel();
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
        // Commit the floating layer
        else if (e.key === 'Enter' && this.model.hasFloatingLayer()) {
            e.preventDefault();
            this.commitFloating();
        }
        // Nudge the floating layer
        else if (this.model.hasFloatingLayer() && key.startsWith('arrow')) {
            e.preventDefault();
            const step = shift ? 10 : 1;
            const dir = key.slice('arrow'.length); // 'arrowup' -> 'up'
            this.model.selection.nudge(dir, step);
            this.render_view();
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

    async toggleShapeMode() {
        if (this.model.hasFloatingLayer()) {
            await this.commitFloating();
        }
        this.model.shapeMode = this.model.shapeMode === 'ellipse' ? 'rect' : 'ellipse';
        if (this.model.selection) {
            this.model.setSelectionShape(this.model.shapeMode);
            this.view.drawSelection(this.model.selection);
            if (!this.isSelecting) {
                await this.model.updateCopyBlob();
            }
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

    async handleMouseDown(e) {
        // mousedown/mouseup are bound on window (not scoped to the canvas), so toolbar
        // clicks bubble through here too. Bail out before touching any selection/floating
        // state so a toolbar click's own click handler still runs normally afterward.
        if (e.target instanceof Node && this.toolbar.contains(e.target)) return;

        if(this.model.isEmpty()) return;

        // Alt-click samples/clears the Alpha Key. Carved out ahead of the floating-layer
        // early return below so sampling stays reachable while a Floating Layer is active.
        if (e.altKey) {
            this.handleAltClick(e);
            return;
        }

        if (this.model.hasFloatingLayer()) {
            await this.handleSelectionMouseDown(e);
            return;
        }

        if (this.model.selection) {
            await this.handleSelectionMouseDown(e);
            return;
        }
        this.isSelecting = true;
        this.startPos = this.getCanvasCoords(e);
    }

    // Shift+alt+click always clears the Alpha Key. Plain alt+click samples it: from the
    // Floating Layer's live preview when the click lands inside its bounds, otherwise from
    // mainImage - same source used when there's no Floating Layer at all.
    handleAltClick(e) {
        if (e.shiftKey) {
            this.model.alphaKey = null;
        } else {
            const coords = this.getCanvasCoords(e);
            const sel = this.model.selection;
            if (this.model.hasFloatingLayer() && sel.contains(coords)) {
                this.model.alphaKey = sel.colorAt(coords, this.model.alphaKey, this.model.colorTolerance);
            } else {
                this.model.alphaKey = this.model.mainImage.pixel_color(coords.x, coords.y);
            }
        }
        this.view.setAlphaColor(this.model.alphaKey);
        this.render_view();
    }

    // Routes a mousedown against an existing selection (marquee or floating) to a
    // resize/move gesture, or - if it misses the selection entirely - commits it (a
    // no-op for marquee, nothing to commit) and starts a fresh selection drag from here.
    async handleSelectionMouseDown(e) {
        const coords = this.getCanvasCoords(e);
        const sel = this.model.selection;
        const handle = this.view.hitTestHandle(sel.bounds(), coords);
        if (handle) {
            sel.beginResize(handle);
            this.selectionDrag = true;
            return;
        }
        if (sel.contains(coords)) {
            sel.beginMove(coords);
            this.selectionDrag = true;
            return;
        }
        await this.commitFloating();
        this.isSelecting = true;
        this.startPos = coords;
    }

    handleMouseMove(e) {
        if (this.selectionDrag) {
            const coords = this.getCanvasCoords(e);
            this.model.selection.applyDrag(coords, e.shiftKey);
            this.render_view();
            return;
        }

        if (!this.isSelecting) return;

        const current = this.getCanvasCoords(e);
        this.model.startDragSelection({
            x: Math.min(this.startPos.x, current.x),
            y: Math.min(this.startPos.y, current.y),
            w: Math.abs(current.x - this.startPos.x),
            h: Math.abs(current.y - this.startPos.y)
        });
        this.view.drawSelection(this.model.selection);
    }

    async handleMouseUp() {
        if (this.selectionDrag) {
            this.model.selection.endDrag();
            this.selectionDrag = null;
            return;
        }

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
        this.render_view();
    }

    handleToleranceChange(e) {
        this.model.colorTolerance = Number(e.target.value);
        if (this.model.hasFloatingLayer()) {
            this.render_view();
        }
    }
}
