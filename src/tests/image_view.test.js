// @vitest-environment jsdom
import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest'
import ImageView from '../image_view.js'
import Selection from '../selection.js'
import { mountFixtureWithCanvasStub } from './dom_helpers.js'
import { create_test_bitmap, create_solid_bitmap } from './test_helpers.js'

const BLACK = { r: 0, g: 0, b: 0 };

function makeMarquee(x = 20, y = 20, w = 40, h = 40, type = 'rect') {
  return new Selection({ x, y, w, h, type });
}

async function makeFloating(x = 20, y = 20, w = 40, h = 40, type = 'rect') {
  const sel = makeMarquee(x, y, w, h, type);
  const original = await create_solid_bitmap(w, h, BLACK);
  sel.enterFloating(original);
  return sel;
}

function stubWindowSize(width, height) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
}

let view, imgCtx, uiCtx;

beforeEach(() => {
  ({ imgCtx, uiCtx } = mountFixtureWithCanvasStub());
  view = new ImageView();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('constructs against the real fixture and renders without throwing', async () => {
  const bitmap = await create_test_bitmap();
  expect(() => view.render(bitmap, null)).not.toThrow();
});

describe('render', () => {
  test('no-ops when bitmap is falsy', () => {
    const resizeSpy = vi.spyOn(view, 'resize');

    view.render(null, null);

    expect(imgCtx.putImageData).not.toHaveBeenCalled();
    expect(resizeSpy).not.toHaveBeenCalled();
  });

  test('resizes both canvases to the bitmap dimensions', async () => {
    stubWindowSize(2000, 2000);
    const bitmap = await create_test_bitmap();

    view.render(bitmap, null);

    expect(view.imgCanvas.width).toBe(bitmap.width);
    expect(view.imgCanvas.height).toBe(bitmap.height);
    expect(view.uiCanvas.width).toBe(bitmap.width);
    expect(view.uiCanvas.height).toBe(bitmap.height);
  });

  test('scales zoom up proportionally for a bitmap smaller than the window on both axes', async () => {
    stubWindowSize(50000, 50000);
    const bitmap = await create_test_bitmap(); // 300x200, tiny relative to window

    view.render(bitmap, null);

    // margin 50 -> available 49950x49950; scaleW = 49950/300 = 166.5, scaleH = 49950/200 = 249.75
    expect(view.zoom).toBe(166.5);
  });

  test('scales zoom down proportionally when the bitmap exceeds the window on both axes', async () => {
    stubWindowSize(500, 500);
    const bitmap = await create_test_bitmap();
    bitmap.resize(1000, 800);

    view.render(bitmap, null);

    // margin 50 -> available 450x450; scaleW = 450/1000 = 0.45, scaleH = 450/800 = 0.5625
    expect(view.zoom).toBe(0.45);
  });

  test('constrains zoom by the tighter axis when the bitmap is narrow but tall', async () => {
    stubWindowSize(1000, 1000);
    const bitmap = await create_test_bitmap();
    bitmap.resize(100, 400);

    view.render(bitmap, null);

    // margin 50 -> available 950x950; scaleW = 950/100 = 9.5, scaleH = 950/400 = 2.375
    expect(view.zoom).toBe(2.375);
  });

  test('constrains zoom by the tighter axis when the bitmap is wide but short', async () => {
    stubWindowSize(1000, 1000);
    const bitmap = await create_test_bitmap();
    bitmap.resize(400, 100);

    view.render(bitmap, null);

    // margin 50 -> available 950x950; scaleW = 950/400 = 2.375, scaleH = 950/100 = 9.5
    expect(view.zoom).toBe(2.375);
  });

  test('lands on exactly zoom 1 when the bitmap exactly matches the available window space', async () => {
    stubWindowSize(350, 250); // margin 50 -> available 300x200, matching the bitmap exactly
    const bitmap = await create_test_bitmap(); // 300x200

    view.render(bitmap, null);

    expect(view.zoom).toBe(1);
  });

  test('calls through to drawSelection with the given selection', async () => {
    stubWindowSize(2000, 2000);
    const bitmap = await create_test_bitmap();
    const drawSelectionSpy = vi.spyOn(view, 'drawSelection');
    const selection = makeMarquee(1, 2, 3, 4);

    view.render(bitmap, selection);

    expect(drawSelectionSpy).toHaveBeenCalledWith(selection);
  });

  test('calls through to drawSelection with a floating selection', async () => {
    stubWindowSize(2000, 2000);
    const bitmap = await create_test_bitmap();
    const drawSelectionSpy = vi.spyOn(view, 'drawSelection');
    const floating = await makeFloating(1, 2, 3, 4);

    view.render(bitmap, floating);

    expect(drawSelectionSpy).toHaveBeenCalledWith(floating);
  });

  test('draws the bitmap pixel data via putImageData', async () => {
    stubWindowSize(2000, 2000);
    const bitmap = await create_test_bitmap();

    view.render(bitmap, null);

    expect(imgCtx.putImageData).toHaveBeenCalledTimes(1);
    const [imageData, x, y] = imgCtx.putImageData.mock.calls[0];
    expect(imageData.width).toBe(bitmap.width);
    expect(imageData.height).toBe(bitmap.height);
    expect(Array.from(imageData.data)).toStrictEqual(Array.from(bitmap.data()));
    expect(x).toBe(0);
    expect(y).toBe(0);
  });

  describe('ui-layer pointer-events', () => {
    test('is none with no selection at all, so a fresh drag reaches the image canvas underneath', async () => {
      stubWindowSize(2000, 2000);
      const bitmap = await create_test_bitmap();

      view.render(bitmap, null);

      expect(view.uiCanvas.style.pointerEvents).toBe('none');
    });

    test('is auto for a marquee selection, so its handles are clickable (new: handles now precede any paste)', async () => {
      stubWindowSize(2000, 2000);
      const bitmap = await create_test_bitmap();

      view.render(bitmap, makeMarquee(0, 0, 10, 10));

      expect(view.uiCanvas.style.pointerEvents).toBe('auto');
    });

    test('is auto while a floating layer is active', async () => {
      stubWindowSize(2000, 2000);
      const bitmap = await create_test_bitmap();
      const floating = await makeFloating(0, 0, 10, 10);

      view.render(bitmap, floating);

      expect(view.uiCanvas.style.pointerEvents).toBe('auto');
    });
  });
});

describe('resize', () => {
  test('sets both canvases width/height and CSS size at zoom 1', () => {
    view.zoom = 1;

    view.resize(400, 250);

    expect(view.imgCanvas.width).toBe(400);
    expect(view.imgCanvas.height).toBe(250);
    expect(view.imgCanvas.style.width).toBe('400px');
    expect(view.imgCanvas.style.height).toBe('250px');
    expect(view.uiCanvas.width).toBe(400);
    expect(view.uiCanvas.height).toBe(250);
    expect(view.uiCanvas.style.width).toBe('400px');
    expect(view.uiCanvas.style.height).toBe('250px');
  });

  test('scales the CSS size (not the pixel size) by the current zoom', () => {
    view.zoom = 0.5;

    view.resize(400, 250);

    expect(view.imgCanvas.width).toBe(400);
    expect(view.imgCanvas.height).toBe(250);
    expect(view.imgCanvas.style.width).toBe('200px');
    expect(view.imgCanvas.style.height).toBe('125px');
  });
});

describe('drawSelection', () => {
  test('clears the ui canvas and returns early when sel is null', () => {
    view.drawSelection(null);

    expect(uiCtx.clearRect).toHaveBeenCalledWith(0, 0, view.uiCanvas.width, view.uiCanvas.height);
    expect(uiCtx.strokeRect).not.toHaveBeenCalled();
  });

  test('draws a stroked, dashed rect at the selection bounds', () => {
    view.zoom = 2;
    const sel = { type: 'rect', x: 10, y: 20, w: 30, h: 40 };
    const outlineSpy = vi.spyOn(view, 'strokeOutline');

    view.drawSelection(sel);

    expect(uiCtx.clearRect).toHaveBeenCalledWith(0, 0, view.uiCanvas.width, view.uiCanvas.height);
    expect(outlineSpy).toHaveBeenCalledWith('rect', 10, 20, 30, 40, '#00ff00');
    expect(uiCtx.strokeRect).toHaveBeenCalledWith(10, 20, 30, 40);
    expect(uiCtx.ellipse).not.toHaveBeenCalled();
  });

  test('draws 8 resize handles for a marquee selection too (new: handles now precede any paste)', () => {
    view.zoom = 1;
    const sel = { type: 'rect', x: 10, y: 20, w: 30, h: 40 };

    view.drawSelection(sel);

    expect(uiCtx.fillRect).toHaveBeenCalledTimes(8);
    expect(uiCtx.strokeRect).toHaveBeenCalledTimes(1 + 8); // outline + 8 handles
  });

  test('draws a stroked, dashed ellipse at the selection bounds when shape is ellipse', () => {
    view.zoom = 2;
    const sel = { type: 'ellipse', x: 10, y: 20, w: 30, h: 40 };
    const outlineSpy = vi.spyOn(view, 'strokeOutline');

    view.drawSelection(sel);

    expect(uiCtx.clearRect).toHaveBeenCalledWith(0, 0, view.uiCanvas.width, view.uiCanvas.height);
    expect(outlineSpy).toHaveBeenCalledWith('ellipse', 10, 20, 30, 40, '#00ff00');
    expect(uiCtx.ellipse).toHaveBeenCalledWith(25, 40, 15, 20, 0, 0, Math.PI * 2);
    // strokeRect is still called for the 8 handles, but never for a 30x40 bounding-box outline
    expect(uiCtx.strokeRect).not.toHaveBeenCalledWith(10, 20, 30, 40);
    expect(uiCtx.strokeRect).toHaveBeenCalledTimes(8);
  });

  describe('with a floating layer', () => {
    test('paints the preview bitmap at its position and outlines it in a distinct color', async () => {
      const floating = await makeFloating(5, 6, 40, 40);

      view.drawSelection(floating);

      expect(uiCtx.clearRect).toHaveBeenCalledWith(0, 0, view.uiCanvas.width, view.uiCanvas.height);
      const [imageData, x, y] = uiCtx.putImageData.mock.calls[0];
      expect(imageData.width).toBe(40);
      expect(x).toBe(5);
      expect(y).toBe(6);
      expect(uiCtx.strokeRect).toHaveBeenCalledWith(5, 6, 40, 40);
    });

    test('outlines with an ellipse when the floating shape is ellipse', async () => {
      const floating = await makeFloating(0, 0, 30, 40, 'ellipse');

      view.drawSelection(floating);

      expect(uiCtx.ellipse).toHaveBeenCalledWith(15, 20, 15, 20, 0, 0, Math.PI * 2);
      // strokeRect is still called for the 8 handles, but never for a 30x40 bounding-box outline
      expect(uiCtx.strokeRect).not.toHaveBeenCalledWith(0, 0, 30, 40);
    });

    test('renders 8 resize handles at the corners and edge midpoints', async () => {
      const floating = await makeFloating(10, 20, 30, 40);

      view.drawSelection(floating);

      expect(uiCtx.fillRect).toHaveBeenCalledTimes(8);
      expect(uiCtx.strokeRect).toHaveBeenCalledTimes(1 + 8); // outline + 8 handles
    });
  });
});

describe('hitTestHandle', () => {
  test('returns the handle name when coords land exactly on a handle center', () => {
    view.zoom = 1;
    const bounds = { x: 10, y: 20, w: 30, h: 40 };

    expect(view.hitTestHandle(bounds, { x: 10, y: 20 })).toBe('nw');
    expect(view.hitTestHandle(bounds, { x: 25, y: 20 })).toBe('n');
    expect(view.hitTestHandle(bounds, { x: 40, y: 20 })).toBe('ne');
    expect(view.hitTestHandle(bounds, { x: 40, y: 40 })).toBe('e');
    expect(view.hitTestHandle(bounds, { x: 40, y: 60 })).toBe('se');
    expect(view.hitTestHandle(bounds, { x: 25, y: 60 })).toBe('s');
    expect(view.hitTestHandle(bounds, { x: 10, y: 60 })).toBe('sw');
    expect(view.hitTestHandle(bounds, { x: 10, y: 40 })).toBe('w');
  });

  test('returns null when coords miss every handle', () => {
    view.zoom = 1;
    const bounds = { x: 10, y: 20, w: 30, h: 40 };

    expect(view.hitTestHandle(bounds, { x: 25, y: 40 })).toBeNull(); // center of the box
  });

  test('shrinks the hit area as zoom increases, to keep on-screen handle size constant', () => {
    view.zoom = 2;
    const bounds = { x: 0, y: 0, w: 10, h: 10 };

    // handle size at zoom 2 is HANDLE_SIZE(8)/zoom(2) = 4 canvas px, so the nw hit
    // area spans roughly [-2, 2) on each axis.
    expect(view.hitTestHandle(bounds, { x: 1, y: 1 })).toBe('nw');
    expect(view.hitTestHandle(bounds, { x: 3, y: 3 })).toBeNull();
  });
});

describe('setShapeMode', () => {
  test('shows the rectangle symbol and clears the active class for rect mode', () => {
    view.setShapeMode('ellipse');

    view.setShapeMode('rect');

    expect(view.shapeToggle.textContent).toBe('Shape: ▭');
    expect(view.shapeToggle.classList.contains('active')).toBe(false);
  });

  test('shows the ellipse symbol and sets the active class for ellipse mode', () => {
    view.setShapeMode('ellipse');

    expect(view.shapeToggle.textContent).toBe('Shape: ⬭');
    expect(view.shapeToggle.classList.contains('active')).toBe(true);
  });
});

describe('setAlphaColor', () => {
  test('sets a translucent background and checks the toggle when a color is given', () => {
    view.setAlphaColor({ r: 10, g: 20, b: 30 });

    expect(view.alphaColor.style.background).toBe('rgba(10, 20, 30, 0.8)');
    expect(view.transparencyToggle.checked).toBe(true);
  });

  test('clears the background and unchecks the toggle when color is null', () => {
    view.setAlphaColor({ r: 10, g: 20, b: 30 });

    view.setAlphaColor(null);

    expect(view.alphaColor.style.background).toBe('transparent');
    expect(view.transparencyToggle.checked).toBe(false);
  });

  test('enables the tolerance slider when a color is given', () => {
    view.setAlphaColor({ r: 10, g: 20, b: 30 });

    expect(view.toleranceSlider.disabled).toBe(false);
  });

  test('disables the tolerance slider when color is null', () => {
    view.setAlphaColor({ r: 10, g: 20, b: 30 });

    view.setAlphaColor(null);

    expect(view.toleranceSlider.disabled).toBe(true);
  });
});

describe('clearCanvas', () => {
  test('resets zoom to 1 and resizes to the default 300x150', () => {
    view.zoom = 3;

    view.clearCanvas();

    expect(view.zoom).toBe(1);
    expect(view.imgCanvas.width).toBe(300);
    expect(view.imgCanvas.height).toBe(150);
    expect(view.imgCanvas.style.width).toBe('300px');
    expect(view.imgCanvas.style.height).toBe('150px');
  });
});

describe('toImageData', () => {
  test('returns an ImageData with the bitmap dimensions and raw pixel bytes', async () => {
    const bitmap = await create_test_bitmap();

    const imageData = view.toImageData(bitmap);

    expect(imageData.width).toBe(bitmap.width);
    expect(imageData.height).toBe(bitmap.height);
    expect(Array.from(imageData.data)).toStrictEqual(Array.from(bitmap.data()));
  });
});
