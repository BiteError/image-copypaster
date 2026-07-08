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
        this.zoom = Math.min(1, scaleW, scaleH);

        this.resize(width, height);

        this.imgCtx.putImageData(bitmap.to_image_data(), 0, 0);
        
        this.drawSelection(selection);
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
        this.uiCtx.strokeRect(sel.x, sel.y, sel.w, sel.h);
    }

    setAlphaColor(color) {
        const newColor = color ? 
          `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)` : 'transparent';

        this.alphaColor.style.background = newColor;
        this.transparencyToggle.checked = !!color;
    }
}
