// @vitest-environment jsdom
import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest'
import ImageView from '../image_view.js'
import { mountFixtureWithCanvasStub } from './dom_helpers.js'
import { create_test_bitmap } from './test_helpers.js'

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

  test('caps zoom at 1 (never upscales) for a bitmap smaller than the window', async () => {
    stubWindowSize(50000, 50000);
    const bitmap = await create_test_bitmap(); // 300x200, tiny relative to window

    view.render(bitmap, null);

    expect(view.zoom).toBe(1);
  });

  test('scales zoom down proportionally when the bitmap exceeds the window on both axes', async () => {
    stubWindowSize(500, 500);
    const bitmap = await create_test_bitmap();
    bitmap.resize(1000, 800);

    view.render(bitmap, null);

    // margin 50 -> available 450x450; scaleW = 450/1000 = 0.45, scaleH = 450/800 = 0.5625
    expect(view.zoom).toBe(0.45);
  });

  test('calls through to drawSelection with the given selection', async () => {
    stubWindowSize(2000, 2000);
    const bitmap = await create_test_bitmap();
    const drawSelectionSpy = vi.spyOn(view, 'drawSelection');
    const selection = { x: 1, y: 2, w: 3, h: 4 };

    view.render(bitmap, selection);

    expect(drawSelectionSpy).toHaveBeenCalledWith(selection);
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
    const sel = { x: 10, y: 20, w: 30, h: 40 };

    view.drawSelection(sel);

    expect(uiCtx.clearRect).toHaveBeenCalledWith(0, 0, view.uiCanvas.width, view.uiCanvas.height);
    expect(uiCtx.strokeStyle).toBe('#00ff00');
    expect(uiCtx.lineWidth).toBe(1); // 2 / zoom(2)
    expect(uiCtx.setLineDash).toHaveBeenCalledWith([2.5, 2.5]); // 5 / zoom(2)
    expect(uiCtx.strokeRect).toHaveBeenCalledWith(10, 20, 30, 40);
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
