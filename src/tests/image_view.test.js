// @vitest-environment jsdom
import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest'
import ImageView from '../image_view.js'
import Selection from '../selection.js'
import ErrorBus from '../error_bus.js'
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

// drawSelection clears only a dirty rect around the selection (not the whole ui-layer).
// Assert some clearRect call fully covers the selection's bounds.
function expectClearCovers(ctx, sel) {
  const covered = ctx.clearRect.mock.calls.some(([cx, cy, cw, ch]) =>
    cx <= sel.x && cy <= sel.y && cx + cw >= sel.x + sel.w && cy + ch >= sel.y + sel.h);
  expect(covered).toBe(true);
}

function stubWindowSize(width, height) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
}

let view, imgCtx, uiCtx, bus;

beforeEach(() => {
  ({ imgCtx, uiCtx } = mountFixtureWithCanvasStub());
  bus = new ErrorBus();
  view = new ImageView(bus);
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

    expect(drawSelectionSpy).toHaveBeenCalledWith(selection, undefined, undefined, undefined);
  });

  test('calls through to drawSelection with a floating selection', async () => {
    stubWindowSize(2000, 2000);
    const bitmap = await create_test_bitmap();
    const drawSelectionSpy = vi.spyOn(view, 'drawSelection');
    const floating = await makeFloating(1, 2, 3, 4);

    view.render(bitmap, floating);

    expect(drawSelectionSpy).toHaveBeenCalledWith(floating, undefined, undefined, undefined);
  });

  test('forwards alphaKey/colorTolerance through to drawSelection', async () => {
    stubWindowSize(2000, 2000);
    const bitmap = await create_test_bitmap();
    const drawSelectionSpy = vi.spyOn(view, 'drawSelection');
    const floating = await makeFloating(1, 2, 3, 4);
    const alphaKey = { r: 1, g: 2, b: 3 };

    view.render(bitmap, floating, alphaKey, 42);

    expect(drawSelectionSpy).toHaveBeenCalledWith(floating, alphaKey, 42, undefined);
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

    // Dirty-rect clear: covers the selection bounds (+ handle/stroke padding), not the
    // whole full-resolution ui-layer.
    expectClearCovers(uiCtx, sel);
    expect(outlineSpy).toHaveBeenCalledWith('rect', 10, 20, 30, 40, '#00ff00', 2);
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

    expectClearCovers(uiCtx, sel);
    expect(outlineSpy).toHaveBeenCalledWith('ellipse', 10, 20, 30, 40, '#00ff00', 2);
    // no native canvas primitive for a superellipse - the outline is traced as a polyline,
    // starting at the rightmost point of the bounding ellipse (center + (rx, 0))
    expect(uiCtx.ellipse).not.toHaveBeenCalled();
    expect(uiCtx.moveTo).toHaveBeenCalledWith(40, 40);
    expect(uiCtx.lineTo).toHaveBeenCalledTimes(90);
    // strokeRect is still called for the 8 handles, but never for a 30x40 bounding-box outline
    expect(uiCtx.strokeRect).not.toHaveBeenCalledWith(10, 20, 30, 40);
    expect(uiCtx.strokeRect).toHaveBeenCalledTimes(8);
  });

  test('a lower shape exponent pulls the traced outline in toward a diamond', () => {
    const sel = { type: 'ellipse', x: 0, y: 0, w: 40, h: 40 };

    view.drawSelection(sel, undefined, undefined, 2);
    const ellipseFirstLineTo = uiCtx.lineTo.mock.calls[0];
    uiCtx.lineTo.mockClear();
    uiCtx.moveTo.mockClear();

    view.drawSelection(sel, undefined, undefined, 1);
    const diamondFirstLineTo = uiCtx.lineTo.mock.calls[0];

    // t=0 is the rightmost vertex (cx+rx, cy) regardless of exponent
    expect(uiCtx.moveTo).toHaveBeenCalledWith(40, 20);
    // but away from that vertex, a lower exponent pulls the x coordinate in faster
    expect(diamondFirstLineTo[0]).toBeLessThan(ellipseFirstLineTo[0]);
  });

  describe('with a floating layer', () => {
    test('paints the preview bitmap at its position and outlines it in a distinct color', async () => {
      const floating = await makeFloating(5, 6, 40, 40);

      view.drawSelection(floating);

      expectClearCovers(uiCtx, floating);
      const [imageData, x, y] = uiCtx.putImageData.mock.calls[0];
      expect(imageData.width).toBe(40);
      expect(x).toBe(5);
      expect(y).toBe(6);
      expect(uiCtx.strokeRect).toHaveBeenCalledWith(5, 6, 40, 40);
    });

    test('forwards alphaKey/colorTolerance into preview()', async () => {
      const floating = await makeFloating(5, 6, 40, 40);
      const previewSpy = vi.spyOn(floating, 'preview');
      const alphaKey = { r: 1, g: 2, b: 3 };

      view.drawSelection(floating, alphaKey, 42);

      expect(previewSpy).toHaveBeenCalledWith(alphaKey, 42, 2);
    });

    test('outlines with a superellipse when the floating shape is ellipse', async () => {
      const floating = await makeFloating(0, 0, 30, 40, 'ellipse');

      view.drawSelection(floating);

      expect(uiCtx.ellipse).not.toHaveBeenCalled();
      expect(uiCtx.moveTo).toHaveBeenCalledWith(30, 20);
      expect(uiCtx.lineTo).toHaveBeenCalledTimes(90);
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

  test('isTouch widens the hit area to roughly 36px, without changing the visual HANDLE_SIZE', () => {
    view.zoom = 1;
    const bounds = { x: 10, y: 20, w: 30, h: 40 };

    // a coordinate 6px off the nw center misses the 8px mouse box...
    expect(view.hitTestHandle(bounds, { x: 16, y: 20 })).toBeNull();
    // ...but lands inside the ~36px touch box at the same coordinate.
    expect(view.hitTestHandle(bounds, { x: 16, y: 20 }, true)).toBe('nw');
  });
});

describe('setShapeMode', () => {
  test('shows the rectangle symbol and clears the active class for rect mode', () => {
    view.setShapeMode('ellipse');

    view.setShapeMode('rect');

    expect(view.shapeToggle.textContent).toBe('⛶');
    expect(view.shapeToggle.classList.contains('active')).toBe(false);
  });

  test('shows the ellipse symbol and sets the active class for ellipse mode', () => {
    view.setShapeMode('ellipse');

    expect(view.shapeToggle.textContent).toBe('◯');
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

  test('leaves the tolerance slider enabled regardless of color', () => {
    view.setAlphaColor({ r: 10, g: 20, b: 30 });
    expect(view.toleranceSlider.disabled).toBe(false);

    view.setAlphaColor(null);
    expect(view.toleranceSlider.disabled).toBe(false);
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

describe('error toasts', () => {
  function toasts() {
    return Array.from(document.querySelectorAll('#toast-container .toast'));
  }

  // the default (unconfigured) view built in beforeEach uses the real default
  // debugConfig: log_level=error, stack_trace disabled.
  test('an error-level report renders a toast with the friendly message', () => {
    bus.report('error', "Couldn't paste image", new Error('boom'));

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].querySelector('.toast-message').textContent).toBe("Couldn't paste image");
  });

  test('the toast carries a severity-specific class', () => {
    bus.report('error', 'something failed');

    expect(toasts()[0].classList.contains('toast-error')).toBe(true);
  });

  test('a warning-level report is hidden by default (below the error threshold)', () => {
    bus.report('warning', 'fallback engaged');

    expect(toasts()).toHaveLength(0);
  });

  test('raising log_level to warning reveals warning-level reports', () => {
    const warnBus = new ErrorBus();
    new ImageView(warnBus, { logLevel: 'warning', stackTrace: false });

    warnBus.report('warning', 'fallback engaged');

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].classList.contains('toast-warning')).toBe(true);
  });

  test('each report gets its own toast, stacking multiple at once', () => {
    bus.report('error', 'first failure');
    bus.report('error', 'second failure');

    expect(toasts()).toHaveLength(2);
    expect(toasts()[0].querySelector('.toast-message').textContent).toBe('first failure');
    expect(toasts()[1].querySelector('.toast-message').textContent).toBe('second failure');
  });

  test('every toast has a close button that removes only that toast when clicked', () => {
    bus.report('error', 'first failure');
    bus.report('error', 'second failure');

    toasts()[0].querySelector('.toast-close').dispatchEvent(new Event('click', { bubbles: true }));

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].querySelector('.toast-message').textContent).toBe('second failure');
  });

  test('stack-trace detail is omitted from the message when stack_trace is disabled', () => {
    bus.report('error', "Couldn't paste image", new Error('boom'));

    expect(toasts()[0].querySelector('.toast-message').textContent).toBe("Couldn't paste image");
  });

  test('stack-trace detail is appended to the toast when stack_trace is enabled', () => {
    const detailBus = new ErrorBus();
    new ImageView(detailBus, { logLevel: 'error', stackTrace: true });
    const err = new Error('boom');

    detailBus.report('error', "Couldn't paste image", err);

    expect(toasts()[0].querySelector('.toast-message').textContent).toContain("Couldn't paste image");
    expect(toasts()[0].querySelector('.toast-message').textContent).toContain(err.stack);
  });

  test('stack_trace also console.errors the raw detail object', () => {
    const detailBus = new ErrorBus();
    new ImageView(detailBus, { logLevel: 'error', stackTrace: true });
    const err = new Error('boom');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    detailBus.report('error', "Couldn't paste image", err);

    expect(consoleSpy).toHaveBeenCalledWith(err);
    consoleSpy.mockRestore();
  });

  test('stack_trace works independently of log_level, revealing detail on an already-visible error toast', () => {
    const detailBus = new ErrorBus();
    new ImageView(detailBus, { logLevel: 'error', stackTrace: true });

    detailBus.report('warning', 'fallback engaged', new Error('nope'));
    detailBus.report('error', 'real failure', new Error('boom'));

    // warning stays hidden (log_level still 'error'); only the error-level toast shows, with detail appended
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].querySelector('.toast-message').textContent).toContain('real failure');
  });

  test('at log_level=debug, the raw error message replaces the friendly one', () => {
    const debugBus = new ErrorBus();
    new ImageView(debugBus, { logLevel: 'debug', stackTrace: false });

    debugBus.report('error', "Couldn't paste image", new Error('Jimp decode failed'));

    expect(toasts()[0].querySelector('.toast-message').textContent).toBe('Jimp decode failed');
  });

  test('at log_level=debug, a report with no detail still falls back to the friendly message', () => {
    const debugBus = new ErrorBus();
    new ImageView(debugBus, { logLevel: 'debug', stackTrace: false });

    debugBus.report('info', 'no image on clipboard');

    expect(toasts()[0].querySelector('.toast-message').textContent).toBe('no image on clipboard');
  });

  test('at log_level=debug with stack_trace enabled, the toast shows the stack without duplicating the raw message', () => {
    const debugBus = new ErrorBus();
    new ImageView(debugBus, { logLevel: 'debug', stackTrace: true });
    const err = new Error('Jimp decode failed');

    debugBus.report('error', "Couldn't paste image", err);

    expect(toasts()[0].querySelector('.toast-message').textContent).toBe(err.stack);
  });
});
