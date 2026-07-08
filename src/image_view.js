/**
 * VIEW: DOM/Canvas interaction
 */
export default class ImageView {
    constructor() {
        this.imgCanvas = document.getElementById('image-canvas');
        this.uiCanvas = document.getElementById('ui-layer');
        this.imgCtx = this.imgCanvas.getContext('2d');
        this.uiCtx = this.uiCanvas.getContext('2d');
        this.zoom = 1;

        this.alphaColor = document.getElementById('alpha-color');
        this.transparencyToggle = document.getElementById('transparency-toggle');
        this.transparencyToggle.checked = false;

        this.shapeToggle = document.getElementById('shape-toggle-btn');
    }

    clearCanvas() {
        this.imgCtx.clearRect(0, 0, this.imgCanvas.width, this.imgCanvas.height);
        this.zoom = 1;
        this.resize(300, 150);
    }

    render(bitmap, selection) {
        if (!bitmap) return;
        const width = bitmap.width;
        const height = bitmap.height;
        
        // Auto zoom logic
        const margin = 50;
        const scaleW = (window.innerWidth - margin) / width;
        const scaleH = (window.innerHeight - margin) / height;
        this.zoom = Math.min(scaleW, scaleH);

        this.resize(width, height);

        this.imgCtx.putImageData(this.toImageData(bitmap), 0, 0);
        
        this.drawSelection(selection);
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

    drawSelection(sel) {
        this.uiCtx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
        if (!sel) return;
        this.uiCtx.strokeStyle = '#00ff00';
        // Adjust line width based on zoom so it always looks "1px" or "2px"
        this.uiCtx.lineWidth = 2 / this.zoom;
        this.uiCtx.setLineDash([5 / this.zoom, 5 / this.zoom]);
        if (sel.type === 'ellipse') {
            this.uiCtx.beginPath();
            this.uiCtx.ellipse(sel.x + sel.w / 2, sel.y + sel.h / 2, sel.w / 2, sel.h / 2, 0, 0, Math.PI * 2);
            this.uiCtx.stroke();
        } else {
            this.uiCtx.strokeRect(sel.x, sel.y, sel.w, sel.h);
        }
    }

    setShapeMode(mode) {
        this.shapeToggle.textContent = mode === 'ellipse' ? 'Shape: ⬭' : 'Shape: ▭';
        this.shapeToggle.classList.toggle('active', mode === 'ellipse');
    }

    setAlphaColor(color) {
        const newColor = color ? 
          `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)` : 'transparent';

        this.alphaColor.style.background = newColor;
        this.transparencyToggle.checked = !!color;
    }
}
