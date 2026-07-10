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
        this.alphaPickArmed = false; // touch equivalent of holding Alt: auto-disarms after one sample
        this.toolbar = document.getElementById('toolbar');

        this.initListeners();
        this.view.setShapeMode(this.model.shapeMode);
    }

    render_view(){
        if(this.model.mainImage.isEmpty()) return;
        this.view.render(this.model.mainImage, this.model.selection, this.model.alphaKey, this.model.colorTolerance, this.model.shapeExponent);
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
        // Parallel to (not replacing) the mouse listeners above - handlers mirror
        // handleMouseDown/Move/Up structurally, reading touch coordinates instead of
        // clientX/Y, and are harmless no-ops on a non-touch device. { passive: false }
        // is required so preventDefault() (blocking scroll/pull-to-refresh mid-drag)
        // actually takes effect.
        window.addEventListener('touchstart', e => this.handleTouchStart(e), { passive: false });
        window.addEventListener('touchmove', e => this.handleTouchMove(e), { passive: false });
        window.addEventListener('touchend', e => this.handleTouchEnd(e), { passive: false });

        // Controls that exist once per toolbar (desktop and mobile) share a js- class,
        // so wiring the class once binds both instances to the same handler.
        this.bindAll('.js-reset-btn', 'click', e => this.handleReset(e));
        this.bindAll('.js-transparency-toggle', 'click', e => this.handleTransparencyToggle(e));
        this.bindAll('.js-tolerance-slider', 'input', e => this.handleToleranceChange(e));
        this.bindAll('.js-shape-slider', 'input', e => this.handleShapeExponentChange(e));
        this.bindAll('.js-flip-h-btn', 'click', () => this.handleManipulate('flipH'));
        this.bindAll('.js-flip-v-btn', 'click', () => this.handleManipulate('flipV'));
        this.bindAll('.js-rotate-btn', 'click', () => this.handleManipulate('rotateCW'));
        this.bindAll('.js-shape-toggle', 'click', () => this.toggleShapeMode());
        this.bindAll('.js-alpha-pick-btn', 'click', () => this.toggleAlphaPick());
        this.bindAll('.js-paste-btn', 'click', async () => this.handlePasteButton());
        this.bindAll('.js-copy-share-btn', 'click', () => this.handleCopyShareButton());

        document.getElementById('paste-file-input')
            .addEventListener('change', e => this.handlePasteFileInput(e));
        document.getElementById('select-all-btn')
            .addEventListener('click', () => this.handleSelectAllButton());
        document.getElementById('cancel-btn')
            .addEventListener('click', () => this.handleCancelButton());
        document.getElementById('undo-btn')
            .addEventListener('click', () => this.handleUndoButton());
        document.getElementById('redo-btn')
            .addEventListener('click', () => this.handleRedoButton());
        document.getElementById('drawer-toggle-btn')
            .addEventListener('click', () => this.toggleDrawer());
        window.addEventListener('click', e => this.handleOutsideDrawerClick(e));

        document.getElementById('help-btn')
            .addEventListener('click', () => this.toggleHelpPanel());
        window.addEventListener('click', e => this.handleOutsideHelpClick(e));
        document.getElementById('help-btn-mobile')
            .addEventListener('click', () => this.toggleHelpPanelMobile());
        window.addEventListener('click', e => this.handleOutsideHelpClickMobile(e));
    }

    bindAll(selector, event, handler) {
        document.querySelectorAll(selector).forEach(el => el.addEventListener(event, handler));
    }

    async handlePaste(e) {
        const item = Array.from(e.clipboardData.items)
                          .find(x => x.type.indexOf('image') !== -1
                                      && x.kind === 'file');
        if (!item) return;

        const blob = item.getAsFile();
        const buffer = await blob.arrayBuffer();
        await this.pasteBuffer(buffer);
    }

    // Shared by Cmd/Ctrl+V (handlePaste), the Paste button's clipboard.read() path, and
    // its file-picker fallback - one entry point into the same
    // commit-then-paste-into-selection-or-createNew Model logic regardless of how the
    // image bytes arrived.
    async pasteBuffer(buffer) {
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

    // Paste button: reads the system clipboard directly (must be called synchronously
    // from the click handler, inside the tap's transient user-activation window - no
    // await may precede it). Falls back to a hidden file input when the Clipboard API
    // is unavailable/unsupported or the read is rejected (e.g. no permission, no image
    // on the clipboard).
    async handlePasteButton() {
        try {
            const items = await navigator.clipboard.read();
            const item = items.find(i => i.types.some(t => t.startsWith('image/')));
            if (!item) throw new Error('no image on clipboard');
            const type = item.types.find(t => t.startsWith('image/'));
            const blob = await item.getType(type);
            const buffer = await blob.arrayBuffer();
            await this.pasteBuffer(buffer);
        } catch (err) {
            document.getElementById('paste-file-input').click();
        }
    }

    async handlePasteFileInput(e) {
        const file = e.target.files[0];
        e.target.value = ''; // allow re-selecting the same file next time
        if (!file) return;
        const buffer = await file.arrayBuffer();
        await this.pasteBuffer(buffer);
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

    // Copy/Share button: reuses pendingCopyBlob exactly as handleCopy does (see ADR
    // 0004 - the blob is already precomputed ahead of the gesture, so this can write
    // synchronously inside the tap's activation window). Falls back to the native share
    // sheet when clipboard.write() fails or is unsupported; the share() call must stay
    // synchronous with the write() rejection, no extra await beyond what's already
    // resolved, for the same user-activation reason.
    async handleCopyShareButton() {
        if (this.model.hasFloatingLayer()) {
            await this.commitFloating();
            await this.model.updateCopyBlob();
        }

        if (!this.model.pendingCopyBlob) return;

        const item = new ClipboardItem({ "image/png": this.model.pendingCopyBlob });
        try {
            await navigator.clipboard.write([item]);
        } catch (err) {
            if (!navigator.share) return;
            const file = new File([this.model.pendingCopyBlob], 'image.png', { type: 'image/png' });
            await navigator.share({ files: [file] });
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
                this.view.drawSelection(this.model.selection, this.model.alphaKey, this.model.colorTolerance, this.model.shapeExponent);
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

    toggleHelpPanelMobile() {
        document.getElementById('help-panel-mobile').classList.toggle('hidden');
    }

    // Closes both help panels - only one is ever actually visible (the other's
    // whole toolbar is display:none via the pointer:coarse breakpoint), so this stays
    // a single method for the keyboard shortcuts (? and Escape) to call.
    closeHelpPanel() {
        document.querySelectorAll('.help-panel').forEach(panel => panel.classList.add('hidden'));
    }

    handleOutsideHelpClick(e) {
        const panel = document.getElementById('help-panel');
        const helpBtn = document.getElementById('help-btn');
        if (panel.classList.contains('hidden')) return;
        if (panel.contains(e.target) || helpBtn.contains(e.target)) return;
        this.closeHelpPanel();
    }

    handleOutsideHelpClickMobile(e) {
        const panel = document.getElementById('help-panel-mobile');
        const helpBtn = document.getElementById('help-btn-mobile');
        if (panel.classList.contains('hidden')) return;
        if (panel.contains(e.target) || helpBtn.contains(e.target)) return;
        this.closeHelpPanel();
    }

    // Compact-layout drawer: same show/hide pattern as the Help panel above. A no-op on
    // desktop, where CSS keeps the drawer always visible regardless of the hidden class.
    toggleDrawer() {
        document.getElementById('drawer').classList.toggle('hidden');
    }

    closeDrawer() {
        document.getElementById('drawer').classList.add('hidden');
    }

    handleOutsideDrawerClick(e) {
        const drawer = document.getElementById('drawer');
        const toggleBtn = document.getElementById('drawer-toggle-btn');
        if (drawer.classList.contains('hidden')) return;
        if (drawer.contains(e.target) || toggleBtn.contains(e.target)) return;
        this.closeDrawer();
    }

    // Touch equivalent of holding Alt while clicking, since there's no modifier key to
    // hold on a touchscreen. Auto-disarms itself after a sample (see sampleAlphaKey), so
    // this toggle only ever arms it or cancels an armed-but-not-yet-used state.
    toggleAlphaPick() {
        this.alphaPickArmed = !this.alphaPickArmed;
        this.view.setAlphaPickArmed(this.alphaPickArmed);
        this.closeDrawer(); // no-op on desktop, where CSS keeps the drawer always visible
    }

    async toggleShapeMode() {
        if (this.model.hasFloatingLayer()) {
            await this.commitFloating();
        }
        this.model.shapeMode = this.model.shapeMode === 'ellipse' ? 'rect' : 'ellipse';
        if (this.model.selection) {
            this.model.setSelectionShape(this.model.shapeMode);
            this.view.drawSelection(this.model.selection, this.model.alphaKey, this.model.colorTolerance, this.model.shapeExponent);
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

        if (this.model.isEmpty()) return;

        // Alt-click samples/clears the Alpha Key; the armed Alpha Color Picker routes
        // here too, sharing the same sampling path. Carved out ahead of the
        // floating-layer branch below so sampling stays reachable while one is active.
        if (e.altKey || this.alphaPickArmed) {
            this.handleAltClick(e);
            return;
        }

        const coords = this.getCanvasCoords(e);
        if (this.model.hasFloatingLayer() || this.model.selection) {
            await this.handleSelectionPointerDown(coords, false);
            return;
        }
        this.isSelecting = true;
        this.startPos = coords;
    }

    async handleTouchStart(e) {
        // Mirrors handleMouseDown's toolbar bail-out.
        if (e.target instanceof Node && this.toolbar.contains(e.target)) return;

        // Ignore multi-touch entirely (no preventDefault), leaving room for a future
        // pinch-zoom feature to claim the second finger.
        if (e.touches.length !== 1) return;

        if (this.model.isEmpty()) return;

        e.preventDefault(); // block scroll/pull-to-refresh mid-drag
        const coords = this.getCanvasCoords(e.touches[0]);

        if (this.alphaPickArmed) {
            this.sampleAlphaKey(coords);
            return;
        }

        if (this.model.hasFloatingLayer() || this.model.selection) {
            await this.handleSelectionPointerDown(coords, true);
            return;
        }
        this.isSelecting = true;
        this.startPos = coords;
    }

    // Shift+alt+click always clears the Alpha Key. Plain alt+click samples it - no
    // touch equivalent of Shift exists, so the Alpha Color Picker armed-state (routed
    // in via handleTouchStart) always goes straight to sampleAlphaKey instead.
    handleAltClick(e) {
        if (e.shiftKey) {
            this.model.alphaKey = null;
            this.view.setAlphaColor(this.model.alphaKey);
            this.render_view();
            return;
        }
        this.sampleAlphaKey(this.getCanvasCoords(e));
    }

    // Samples the Alpha Key at a canvas coordinate: from the Floating Layer's live
    // preview when the coordinate lands inside its bounds, otherwise from mainImage -
    // same source used when there's no Floating Layer at all. Shared by mouse
    // Alt+Click and the touch Alpha Color Picker armed-state tap. Always disarms the
    // picker afterward - a no-op when reached via Alt+Click, which never arms it.
    sampleAlphaKey(coords) {
        const sel = this.model.selection;
        if (this.model.hasFloatingLayer() && sel.contains(coords)) {
            this.model.alphaKey = sel.colorAt(coords, this.model.alphaKey, this.model.colorTolerance, this.model.shapeExponent);
        } else {
            this.model.alphaKey = this.model.mainImage.pixel_color(coords.x, coords.y);
        }
        this.view.setAlphaColor(this.model.alphaKey);
        this.alphaPickArmed = false;
        this.view.setAlphaPickArmed(false);
        this.render_view();
    }

    // Routes a mousedown/touchstart against an existing selection (marquee or
    // floating) to a resize/move gesture, or - if it misses the selection entirely -
    // commits it (a no-op for marquee, nothing to commit) and starts a fresh selection
    // drag from here. isTouch widens the Handle hit-test for a fingertip-sized target.
    async handleSelectionPointerDown(coords, isTouch) {
        const sel = this.model.selection;
        const handle = this.view.hitTestHandle(sel.bounds(), coords, isTouch);
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
        this.handlePointerMove(this.getCanvasCoords(e), e.shiftKey);
    }

    handleTouchMove(e) {
        if (e.touches.length !== 1) return; // see handleTouchStart
        if (!this.selectionDrag && !this.isSelecting) return;
        e.preventDefault();
        // No touch equivalent of Shift+drag's aspect-ratio lock (deferred - see PRD).
        this.handlePointerMove(this.getCanvasCoords(e.touches[0]), false);
    }

    handlePointerMove(coords, lockAspect) {
        if (this.selectionDrag) {
            this.model.selection.applyDrag(coords, lockAspect);
            this.render_view();
            return;
        }

        if (!this.isSelecting) return;

        this.model.startDragSelection({
            x: Math.min(this.startPos.x, coords.x),
            y: Math.min(this.startPos.y, coords.y),
            w: Math.abs(coords.x - this.startPos.x),
            h: Math.abs(coords.y - this.startPos.y)
        });
        this.view.drawSelection(this.model.selection, this.model.alphaKey, this.model.colorTolerance, this.model.shapeExponent);
    }

    async handleMouseUp() {
        await this.handlePointerUp();
    }

    async handleTouchEnd(e) {
        const wasGesture = this.selectionDrag || this.isSelecting;
        if (wasGesture) e.preventDefault();
        await this.handlePointerUp();
    }

    async handlePointerUp() {
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
        this.updateSliderHint(e.target, 'Tolerance');
        if (this.model.hasFloatingLayer()) {
            this.render_view();
        }
    }

    handleShapeExponentChange(e) {
        this.model.shapeExponent = Number(e.target.value);
        this.updateSliderHint(e.target, 'Roundness');
        if (!this.model.selection) return;
        this.view.drawSelection(this.model.selection, this.model.alphaKey, this.model.colorTolerance, this.model.shapeExponent);
        if (!this.model.hasFloatingLayer()) {
            this.model.updateCopyBlob();
        }
    }

    // Desktop wraps its sliders in a .hint-wrap (see index.html) so their name/value
    // shows as a hover tooltip instead of a persistent <label>; mobile sliders have no
    // such wrapper (no hover on touch), so this is a no-op there.
    updateSliderHint(slider, name) {
        const wrap = slider.closest('.hint-wrap');
        if (wrap) wrap.dataset.hint = `${name}: ${slider.value}`;
    }

    // Select All / Cancel / Undo / Redo buttons: on-screen equivalents of the
    // Cmd/Ctrl+A, Escape-with-floating-layer, Cmd/Ctrl+Z, and Cmd/Ctrl+Shift+Z branches
    // in handleKeyDown, mirrored almost verbatim.
    handleSelectAllButton() {
        if (this.model.isEmpty()) return;
        this.model.selectAll();
        this.model.updateCopyBlob();
        this.view.drawSelection(this.model.selection, this.model.alphaKey, this.model.colorTolerance, this.model.shapeExponent);
    }

    handleCancelButton() {
        if (!this.model.hasFloatingLayer()) return;
        this.model.cancelFloatingLayer();
        this.render_view();
    }

    // Suppressed while a Floating Layer is active, matching the existing keyboard behavior.
    handleUndoButton() {
        if (this.model.hasFloatingLayer()) return;
        const img = this.model.undo();
        if (img) this.render_view();
    }

    handleRedoButton() {
        if (this.model.hasFloatingLayer()) return;
        const img = this.model.redo();
        if (img) this.render_view();
    }
}
