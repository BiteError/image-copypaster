// @vitest-environment jsdom
import { expect, test, describe, beforeAll, beforeEach, vi } from 'vitest'
import ImageController from '../image_controller.js'
import ImageModel from '../image_model.js'
import Selection from '../selection.js'
import { mountFixture } from './dom_helpers.js'
import { create_solid_png_buffer } from './test_helpers.js'

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

// Mirrors ImageView.getHandleRects's geometry (8 handles at corners/edge-midpoints,
// HANDLE_SIZE 8 at zoom 1) so hit-testing tests exercise real-ish coordinates.
const HANDLE_POSITIONS = {
  nw: [0, 0], n: [0.5, 0], ne: [1, 0],
  w: [0, 0.5], e: [1, 0.5],
  sw: [0, 1], s: [0.5, 1], se: [1, 1],
};

function fakeGetHandleRects(bounds, zoom = 1) {
  const size = 8 / zoom;
  return Object.entries(HANDLE_POSITIONS).map(([type, [px, py]]) => ({
    type,
    x: bounds.x + bounds.w * px - size / 2,
    y: bounds.y + bounds.h * py - size / 2,
    w: size,
    h: size,
  }));
}

function makeFakeView() {
  const view = {
    render: vi.fn(),
    drawSelection: vi.fn(),
    setAlphaColor: vi.fn(),
    clearCanvas: vi.fn(),
    setShapeMode: vi.fn(),
    setAlphaPickArmed: vi.fn(),
    imgCanvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    zoom: 1,
  };
  view.hitTestHandle = vi.fn((bounds, coords) => {
    const hit = fakeGetHandleRects(bounds, view.zoom)
      .find(r => coords.x >= r.x && coords.x < r.x + r.w && coords.y >= r.y && coords.y < r.y + r.h);
    return hit ? hit.type : null;
  });
  return view;
}

function fakeImageFile(buffer) {
  return { getAsFile: () => ({ arrayBuffer: async () => buffer }) };
}

function dispatchPaste(items) {
  const event = new Event('paste');
  event.clipboardData = { items };
  window.dispatchEvent(event);
}

function dispatchCopy() {
  const event = new Event('copy', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

function makeFakeBus() {
  return { report: vi.fn() };
}

// Constructed once for the whole file (see PRD decision 6): initListeners
// registers window-level listeners with no teardown, so a fresh controller
// per test would accumulate stale listeners firing against later state.
let controller, model, fakeView, fakeBus;

beforeAll(() => {
  mountFixture();
  model = new ImageModel();
  fakeView = makeFakeView();
  fakeBus = makeFakeBus();
  controller = new ImageController(model, fakeView, fakeBus);
});

beforeEach(() => {
  model = new ImageModel();
  fakeView = makeFakeView();
  fakeBus = makeFakeBus();
  controller.model = model;
  controller.view = fakeView;
  controller.bus = fakeBus;
  controller.isSelecting = false;
  controller.alphaPickArmed = false;
  navigator.clipboard.write.mockClear();
  navigator.clipboard.read.mockReset();
  navigator.share.mockReset();
});

test('constructs against the real fixture without throwing', () => {
  expect(controller).toBeInstanceOf(ImageController);
});

describe('handlePaste', () => {
  test('ignores non-image clipboard items', async () => {
    const createNewSpy = vi.spyOn(model, 'createNew');

    dispatchPaste([{ type: 'text/plain', kind: 'string', getAsFile: () => null }]);
    await Promise.resolve();

    expect(createNewSpy).not.toHaveBeenCalled();
    expect(fakeView.render).not.toHaveBeenCalled();
  });

  test('calls model.createNew when there is no active selection, then re-renders', async () => {
    const buffer = await create_solid_png_buffer(100, 100, WHITE);
    const createNewSpy = vi.spyOn(model, 'createNew');

    dispatchPaste([{ type: 'image/png', kind: 'file', ...fakeImageFile(buffer) }]);

    await vi.waitFor(() => expect(createNewSpy).toHaveBeenCalled());
    await vi.waitFor(() => expect(fakeView.render).toHaveBeenCalled());
  });

  test('calls model.pasteIntoSelection when a selection is active, then re-renders', async () => {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ x: 0, y: 0, w: 50, h: 50 });
    const pasteSpy = vi.spyOn(model, 'pasteIntoSelection');
    const buffer = await create_solid_png_buffer(50, 50, BLACK);

    dispatchPaste([{ type: 'image/png', kind: 'file', ...fakeImageFile(buffer) }]);

    await vi.waitFor(() => expect(pasteSpy).toHaveBeenCalled());
    await vi.waitFor(() => expect(fakeView.render).toHaveBeenCalled());
  });

  test('re-pasting while a floating layer is active commits the old one first, then floats the new image', async () => {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x: 10, y: 10, w: 20, h: 20 });
    await model.pasteIntoSelection(await create_solid_png_buffer(20, 20, BLACK));

    const newBuffer = await create_solid_png_buffer(20, 20, { r: 0, g: 255, b: 0 });
    dispatchPaste([{ type: 'image/png', kind: 'file', ...fakeImageFile(newBuffer) }]);

    await vi.waitFor(() => expect(fakeView.render).toHaveBeenCalled());
    // old floating content baked into mainImage at its original bounds
    expect(model.mainImage.pixel_color(15, 15)).toStrictEqual(BLACK);
    // a fresh floating layer holds the newly pasted image, at the (unchanged) selection bounds
    expect(model.hasFloatingLayer()).toBe(true);
    expect(model.selection).toMatchObject({ x: 10, y: 10, w: 20, h: 20 });
    expect(model.selection.original.pixel_color(0, 0)).toStrictEqual({ r: 0, g: 255, b: 0 });
    expect(model.history).toHaveLength(2); // createNew + the auto-commit; the new paste isn't committed yet
  });

  test('pasting when no floating layer is active behaves exactly as a first-time paste', async () => {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 50, h: 50 });
    const commitSpy = vi.spyOn(model, 'commitFloatingLayer');
    const buffer = await create_solid_png_buffer(50, 50, BLACK);

    dispatchPaste([{ type: 'image/png', kind: 'file', ...fakeImageFile(buffer) }]);

    await vi.waitFor(() => expect(fakeView.render).toHaveBeenCalled());
    expect(commitSpy).not.toHaveBeenCalled();
  });
});

describe('handleCopy', () => {
  test('no-ops (and does not preventDefault) when pendingCopyBlob is null', () => {
    model.pendingCopyBlob = null;

    const event = dispatchCopy();

    expect(navigator.clipboard.write).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  test('writes to clipboard with a ClipboardItem and preventDefaults when a blob is pending', () => {
    model.pendingCopyBlob = new Blob(['x'], { type: 'image/png' });

    const event = dispatchCopy();

    expect(navigator.clipboard.write).toHaveBeenCalledWith([expect.any(ClipboardItem)]);
    expect(event.defaultPrevented).toBe(true);
  });

  test('commits the floating layer first, then copies the now-updated canvas region', async () => {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x: 50, y: 50, w: 100, h: 100 });
    await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

    const event = dispatchCopy();

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(model.hasFloatingLayer()).toBe(false));
    expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(BLACK);
    await vi.waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledWith([expect.any(ClipboardItem)]));
    // pendingCopyBlob was refreshed from the committed canvas, not the floating preview
    expect(model.pendingCopyBlob).toBeInstanceOf(Blob);
  });
});

describe('handleKeyDown', () => {
  function dispatchKey(key, opts = {}) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
  }

  test('Ctrl/Cmd+Z undoes and re-renders when there is something to undo', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    await model.createNew(await create_solid_png_buffer(110, 100, WHITE));

    dispatchKey('z', { ctrlKey: true });

    expect(model.mainImage.width).toBe(100);
    expect(fakeView.render).toHaveBeenCalled();
  });

  test('does not re-render on a no-op undo at the boundary', () => {
    dispatchKey('z', { ctrlKey: true });

    expect(fakeView.render).not.toHaveBeenCalled();
  });

  test('Ctrl/Cmd+Shift+Z redoes and re-renders', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    await model.createNew(await create_solid_png_buffer(110, 100, WHITE));
    model.undo();
    fakeView.render.mockClear();

    dispatchKey('z', { ctrlKey: true, shiftKey: true });

    expect(model.mainImage.width).toBe(110);
    expect(fakeView.render).toHaveBeenCalled();
  });

  test('Ctrl/Cmd+Y redoes and re-renders', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    await model.createNew(await create_solid_png_buffer(110, 100, WHITE));
    model.undo();
    fakeView.render.mockClear();

    dispatchKey('y', { ctrlKey: true });

    expect(model.mainImage.width).toBe(110);
    expect(fakeView.render).toHaveBeenCalled();
  });

  describe('undo/redo suppression while a floating layer is active', () => {
    async function setupFloatingLayer() {
      await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
      await model.createNew(await create_solid_png_buffer(110, 100, WHITE));
      model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 50, h: 50 });
      await model.pasteIntoSelection(await create_solid_png_buffer(50, 50, BLACK));
    }

    test('Ctrl/Cmd+Z is a no-op and does not touch the history stack', async () => {
      await setupFloatingLayer();
      const historyBefore = [...model.history];

      dispatchKey('z', { ctrlKey: true });

      expect(model.history).toStrictEqual(historyBefore);
      expect(model.hasFloatingLayer()).toBe(true);
      expect(fakeView.render).not.toHaveBeenCalled();
    });

    test('Ctrl/Cmd+Y is a no-op and does not touch the history stack', async () => {
      await setupFloatingLayer();
      const historyBefore = [...model.history];

      dispatchKey('y', { ctrlKey: true });

      expect(model.history).toStrictEqual(historyBefore);
      expect(model.hasFloatingLayer()).toBe(true);
      expect(fakeView.render).not.toHaveBeenCalled();
    });

    test('undo/redo resume normal behavior immediately after commit', async () => {
      await setupFloatingLayer();
      await model.commitFloatingLayer();
      fakeView.render.mockClear();

      dispatchKey('z', { ctrlKey: true });

      expect(model.mainImage.width).toBe(110); // reverted to the pre-commit snapshot
      expect(fakeView.render).toHaveBeenCalled();
    });

    test('undo/redo resume normal behavior immediately after cancel', async () => {
      await setupFloatingLayer();
      model.cancelFloatingLayer();
      fakeView.render.mockClear();

      dispatchKey('z', { ctrlKey: true });

      expect(model.mainImage.width).toBe(100);
      expect(fakeView.render).toHaveBeenCalled();
    });
  });

  test('Ctrl/Cmd+A selects the full image, updates the copy blob, and draws the selection', async () => {
    await model.createNew(await create_solid_png_buffer(120, 80, WHITE));
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');

    dispatchKey('a', { ctrlKey: true });

    expect(model.selection).toMatchObject({ type: 'rect', x: 0, y: 0, w: 120, h: 80 });
    expect(updateCopyBlobSpy).toHaveBeenCalled();
    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
  });

  test('Ctrl/Cmd+A does nothing on an empty model', () => {
    dispatchKey('a', { ctrlKey: true });

    expect(model.selection).toBeNull();
    expect(fakeView.drawSelection).not.toHaveBeenCalled();
  });

  test('Ctrl/Cmd+A always selects a rectangle, even when shape mode is ellipse', async () => {
    await model.createNew(await create_solid_png_buffer(120, 80, WHITE));
    model.shapeMode = 'ellipse';

    dispatchKey('a', { ctrlKey: true });

    expect(model.selection).toMatchObject({ type: 'rect', x: 0, y: 0, w: 120, h: 80 });
    expect(model.shapeMode).toBe('ellipse'); // Select All neither reads nor writes shape mode
  });

  test('Enter commits the floating layer', async () => {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x: 50, y: 50, w: 100, h: 100 });
    await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

    dispatchKey('Enter');

    await vi.waitFor(() => expect(fakeView.render).toHaveBeenCalled());
    expect(model.hasFloatingLayer()).toBe(false);
    expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(BLACK);
  });

  test('Enter does nothing without a floating layer', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    const historyLengthBefore = model.history.length;

    dispatchKey('Enter');

    expect(model.history).toHaveLength(historyLengthBefore);
  });

  test('Escape clears isSelecting and selection', () => {
    controller.isSelecting = true;
    model.selection = new Selection({ x: 0, y: 0, w: 10, h: 10 });

    dispatchKey('Escape');

    expect(controller.isSelecting).toBe(false);
    expect(model.selection).toBeNull();
    expect(fakeView.drawSelection).toHaveBeenCalledWith(null);
  });

  test('Escape cancels the floating layer instead of deselecting, with no history entry', async () => {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x: 50, y: 50, w: 100, h: 100 });
    await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));
    const historyLengthBefore = model.history.length;

    dispatchKey('Escape');

    expect(model.hasFloatingLayer()).toBe(false);
    expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(WHITE); // canvas reverted, nothing was ever baked in
    expect(model.history).toHaveLength(historyLengthBefore);
    expect(model.selection).toMatchObject({ type: 'rect', x: 50, y: 50, w: 100, h: 100 }); // the pre-paste selection survives
    expect(fakeView.render).toHaveBeenCalled();
  });

  test('r/h/v trigger manipulateSelection with the right direction when a selection exists', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ x: 0, y: 0, w: 100, h: 100 });
    const manipulateSpy = vi.spyOn(model, 'manipulateSelection');

    dispatchKey('r');
    expect(manipulateSpy).toHaveBeenLastCalledWith('rotateCW');

    dispatchKey('h');
    expect(manipulateSpy).toHaveBeenLastCalledWith('flipH');

    dispatchKey('v');
    expect(manipulateSpy).toHaveBeenLastCalledWith('flipV');

    expect(fakeView.render).toHaveBeenCalled();
  });

  test('r/h/v update the floating selection transform, not mainImage, when a floating layer is active', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 40, h: 40 });
    await model.pasteIntoSelection(await create_solid_png_buffer(40, 40, BLACK));

    dispatchKey('r');

    expect(model.selection.rotation).toBe(90);
    expect(model.mainImage.pixel_color(10, 10)).toStrictEqual(WHITE);
  });

  test('shift+r maps to rotateCCW', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ x: 0, y: 0, w: 100, h: 100 });
    const manipulateSpy = vi.spyOn(model, 'manipulateSelection');

    dispatchKey('r', { shiftKey: true });

    expect(manipulateSpy).toHaveBeenCalledWith('rotateCCW');
  });

  test('r/h/v do nothing without an active selection', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    const manipulateSpy = vi.spyOn(model, 'manipulateSelection');

    dispatchKey('r');

    expect(manipulateSpy).not.toHaveBeenCalled();
  });

  test('spacebar toggles shape mode and updates the toolbar indicator', () => {
    expect(model.shapeMode).toBe('rect');

    dispatchKey(' ');

    expect(model.shapeMode).toBe('ellipse');
    expect(fakeView.setShapeMode).toHaveBeenCalledWith('ellipse');

    dispatchKey(' ');

    expect(model.shapeMode).toBe('rect');
    expect(fakeView.setShapeMode).toHaveBeenCalledWith('rect');
  });

  test('shape mode set by spacebar determines the shape of the next selection drawn', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    dispatchKey(' ');

    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 40 }));

    expect(model.selection.type).toBe('ellipse');
  });

  test('spacebar pressed mid-drag switches the in-progress selection shape live', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 40 }));
    expect(model.selection.type).toBe('rect');
    fakeView.drawSelection.mockClear();
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');

    dispatchKey(' ');

    expect(model.selection.type).toBe('ellipse');
    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
    expect(updateCopyBlobSpy).not.toHaveBeenCalled();
  });

  test('spacebar pressed after a selection is finalized switches its shape and refreshes the copy blob', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 40 }));
    window.dispatchEvent(new Event('mouseup'));
    expect(controller.isSelecting).toBe(false);
    expect(model.selection.type).toBe('rect');
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');

    dispatchKey(' ');
    await vi.waitFor(() => expect(updateCopyBlobSpy).toHaveBeenCalled());

    expect(model.selection.type).toBe('ellipse');
    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
  });

  describe('arrow-key nudge', () => {
    async function setupFloatingLayer(x = 20, y = 20, w = 40, h = 40) {
      await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
      model.selection = new Selection({ type: 'rect', x, y, w, h });
      await model.pasteIntoSelection(await create_solid_png_buffer(w, h, BLACK));
    }

    test('moves the floating layer 1px per arrow press', async () => {
      await setupFloatingLayer();

      dispatchKey('ArrowRight');
      dispatchKey('ArrowDown');

      expect(model.selection).toMatchObject({ x: 21, y: 21 });
      expect(fakeView.render).toHaveBeenCalled();
    });

    test('Shift+arrow nudges by the larger step', async () => {
      await setupFloatingLayer();

      dispatchKey('ArrowLeft', { shiftKey: true });
      dispatchKey('ArrowUp', { shiftKey: true });

      expect(model.selection).toMatchObject({ x: 10, y: 10 });
    });

    test('arrow keys do nothing without a floating layer', async () => {
      await model.createNew(await create_solid_png_buffer(100, 100, WHITE));

      dispatchKey('ArrowRight');

      expect(fakeView.render).not.toHaveBeenCalled();
    });
  });
});

describe('shape-toggle-btn', () => {
  test('clicking toggles shape mode the same way spacebar does', () => {
    expect(model.shapeMode).toBe('rect');

    document.getElementById('shape-toggle-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.shapeMode).toBe('ellipse');
    expect(fakeView.setShapeMode).toHaveBeenCalledWith('ellipse');
  });

  test('clicking after a selection is finalized switches its shape and refreshes the copy blob', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 10, h: 10 });
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');

    document.getElementById('shape-toggle-btn').dispatchEvent(new Event('click', { bubbles: true }));
    await vi.waitFor(() => expect(updateCopyBlobSpy).toHaveBeenCalled());

    expect(model.selection.type).toBe('ellipse');
    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
  });
});

describe('getCanvasCoords', () => {
  test('maps clientX/Y through the canvas bounding rect and view.zoom', () => {
    fakeView.imgCanvas.getBoundingClientRect = () => ({ left: 10, top: 20 });
    fakeView.zoom = 2;

    const coords = controller.getCanvasCoords({ clientX: 110, clientY: 220 });

    expect(coords).toStrictEqual({ x: 50, y: 100 });
  });
});

describe('handleMouseDown', () => {
  function dispatchMouseDown(opts = {}) {
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...opts }));
  }

  test('no-ops entirely when the model is empty', () => {
    dispatchMouseDown({ clientX: 0, clientY: 0 });

    expect(controller.isSelecting).toBe(false);
    expect(fakeView.setAlphaColor).not.toHaveBeenCalled();
  });

  test('starts a selection drag on a plain click', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));

    dispatchMouseDown({ clientX: 10, clientY: 20 });

    expect(controller.isSelecting).toBe(true);
    expect(controller.startPos).toStrictEqual({ x: 10, y: 20 });
  });

  test('alt+click sets alphaKey from the clicked pixel color', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK));

    dispatchMouseDown({ clientX: 0, clientY: 0, altKey: true });

    expect(model.alphaKey).toStrictEqual(BLACK);
    expect(controller.isSelecting).toBe(false);
    expect(fakeView.setAlphaColor).toHaveBeenCalledWith(BLACK);
  });

  test('alt+click does not error when there is no floating layer', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK));

    dispatchMouseDown({ clientX: 0, clientY: 0, altKey: true });

    expect(fakeView.render).toHaveBeenCalledWith(model.mainImage, model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
  });

  test('alt+shift+click clears alphaKey', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.alphaKey = BLACK;

    dispatchMouseDown({ clientX: 0, clientY: 0, altKey: true, shiftKey: true });

    expect(model.alphaKey).toBeNull();
    expect(fakeView.setAlphaColor).toHaveBeenCalledWith(null);
  });

  test('alt+click still samples color even when a marquee selection already exists', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK));
    model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 50, h: 50 });

    dispatchMouseDown({ clientX: 0, clientY: 0, altKey: true });

    expect(model.alphaKey).toStrictEqual(BLACK);
  });

  describe('while a floating layer is active', () => {
    async function setupFloatingLayer(x = 20, y = 20, w = 40, h = 40) {
      await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
      model.selection = new Selection({ type: 'rect', x, y, w, h });
      await model.pasteIntoSelection(await create_solid_png_buffer(w, h, BLACK, { r: 9, g: 9, b: 9 }));
    }

    test('alt+click inside the bounds samples from the floating layer\'s preview, not mainImage', async () => {
      await setupFloatingLayer(20, 20, 40, 40); // corner pixel of the pasted patch is {9,9,9}

      dispatchMouseDown({ clientX: 20, clientY: 20, altKey: true });

      expect(model.alphaKey).toStrictEqual({ r: 9, g: 9, b: 9 });
      expect(fakeView.setAlphaColor).toHaveBeenCalledWith({ r: 9, g: 9, b: 9 });
    });

    test('alt+click inside the bounds re-renders the live preview with the newly sampled key', async () => {
      await setupFloatingLayer(20, 20, 40, 40);

      dispatchMouseDown({ clientX: 20, clientY: 20, altKey: true });

      expect(fakeView.render).toHaveBeenCalledWith(model.mainImage, model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
    });

    test('alt+click outside the bounds samples from mainImage, unchanged', async () => {
      await setupFloatingLayer(20, 20, 40, 40);

      dispatchMouseDown({ clientX: 90, clientY: 90, altKey: true }); // outside the floating layer, on WHITE background

      expect(model.alphaKey).toStrictEqual(WHITE);
    });

    test('alt+click outside the bounds still re-renders the floating layer preview', async () => {
      await setupFloatingLayer(20, 20, 40, 40);

      dispatchMouseDown({ clientX: 90, clientY: 90, altKey: true });

      expect(fakeView.render).toHaveBeenCalledWith(model.mainImage, model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
    });

    test('alt+click does not begin a resize/move gesture', async () => {
      await setupFloatingLayer(20, 20, 40, 40);
      const beginMoveSpy = vi.spyOn(model.selection, 'beginMove');

      dispatchMouseDown({ clientX: 40, clientY: 40, altKey: true }); // inside the box, would hit "move" without altKey

      expect(beginMoveSpy).not.toHaveBeenCalled();
      expect(controller.selectionDrag).toBeFalsy();
    });

    test('alt+shift+click still clears alphaKey while floating', async () => {
      await setupFloatingLayer(20, 20, 40, 40);
      model.alphaKey = BLACK;

      dispatchMouseDown({ clientX: 40, clientY: 40, altKey: true, shiftKey: true });

      expect(model.alphaKey).toBeNull();
      expect(fakeView.setAlphaColor).toHaveBeenCalledWith(null);
    });

    test('alt+shift+click re-renders the floating layer preview back to opaque', async () => {
      await setupFloatingLayer(20, 20, 40, 40);
      model.alphaKey = BLACK;

      dispatchMouseDown({ clientX: 40, clientY: 40, altKey: true, shiftKey: true });

      expect(fakeView.render).toHaveBeenCalledWith(model.mainImage, model.selection, null, model.colorTolerance, model.shapeExponent);
    });
  });
});

describe('handleMouseMove', () => {
  function dispatchMouseMove(opts = {}) {
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, ...opts }));
  }

  test('no-ops when not selecting', () => {
    dispatchMouseMove({ clientX: 5, clientY: 5 });

    expect(fakeView.drawSelection).not.toHaveBeenCalled();
  });

  test('updates model.selection from startPos to the current position while selecting', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    controller.isSelecting = true;
    controller.startPos = { x: 50, y: 50 };

    dispatchMouseMove({ clientX: 20, clientY: 30 });

    expect(model.selection).toMatchObject({ type: 'rect', x: 20, y: 30, w: 30, h: 20 });
    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
  });
});

describe('handleMouseUp', () => {
  function dispatchMouseUp() {
    window.dispatchEvent(new Event('mouseup'));
  }

  test('collapses a zero-width/height drag back to selection = null', async () => {
    controller.isSelecting = true;
    model.selection = new Selection({ x: 10, y: 10, w: 0, h: 5 });

    dispatchMouseUp();

    expect(model.selection).toBeNull();
  });

  test('calls model.updateCopyBlob when a non-empty selection resulted', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    controller.isSelecting = true;
    model.selection = new Selection({ x: 0, y: 0, w: 10, h: 10 });
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');

    dispatchMouseUp();

    await vi.waitFor(() => expect(updateCopyBlobSpy).toHaveBeenCalled());
  });
});

describe('marquee selection move & resize (new: handles now exist before any paste)', () => {
  function dispatchMouseDown(opts = {}) {
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...opts }));
  }
  function dispatchMouseMove(opts = {}) {
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, ...opts }));
  }
  function dispatchMouseUp() {
    window.dispatchEvent(new Event('mouseup'));
  }

  async function setupMarqueeSelection(x = 20, y = 20, w = 40, h = 40) {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x, y, w, h });
  }

  test('mousedown on a handle begins a resize gesture, without altering pixels', async () => {
    await setupMarqueeSelection(); // box: x20 y20 w40 h40 -> se handle at (60,60)
    const beginResizeSpy = vi.spyOn(model.selection, 'beginResize');

    dispatchMouseDown({ clientX: 60, clientY: 60 });

    expect(beginResizeSpy).toHaveBeenCalledWith('se');
    expect(controller.selectionDrag).toBeTruthy();
    expect(model.hasFloatingLayer()).toBe(false);
  });

  test('mousedown inside the box (not on a handle) begins a move gesture', async () => {
    await setupMarqueeSelection();
    const beginMoveSpy = vi.spyOn(model.selection, 'beginMove');

    dispatchMouseDown({ clientX: 40, clientY: 40 }); // center, well clear of any handle

    expect(beginMoveSpy).toHaveBeenCalledWith({ x: 40, y: 40 });
    expect(controller.selectionDrag).toBeTruthy();
  });

  test('dragging a handle resizes the marquee selection directly, never touching mainImage', async () => {
    await setupMarqueeSelection();
    dispatchMouseDown({ clientX: 60, clientY: 60 }); // se handle

    dispatchMouseMove({ clientX: 80, clientY: 70 });

    expect(model.selection).toMatchObject({ x: 20, y: 20, w: 60, h: 50 });
    expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE);
  });

  test('mouseup ends the drag', async () => {
    await setupMarqueeSelection();
    dispatchMouseDown({ clientX: 40, clientY: 40 });
    const endDragSpy = vi.spyOn(model.selection, 'endDrag');

    dispatchMouseUp();

    expect(endDragSpy).toHaveBeenCalled();
    expect(controller.selectionDrag).toBeNull();
  });

  test('mousedown outside the box discards it and starts a normal selection drag from there', async () => {
    await setupMarqueeSelection();

    dispatchMouseDown({ clientX: 150, clientY: 150 });

    await vi.waitFor(() => expect(controller.isSelecting).toBe(true));
    expect(controller.selectionDrag).toBeNull();
    expect(controller.startPos).toStrictEqual({ x: 150, y: 150 });
  });
});

describe('floating layer move & resize (routing)', () => {
  function dispatchMouseDown(opts = {}) {
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...opts }));
  }
  function dispatchMouseMove(opts = {}) {
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, ...opts }));
  }
  function dispatchMouseUp() {
    window.dispatchEvent(new Event('mouseup'));
  }

  async function setupFloatingLayer(x = 20, y = 20, w = 40, h = 40) {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x, y, w, h });
    await model.pasteIntoSelection(await create_solid_png_buffer(w, h, BLACK));
  }

  // The exact resize/flip-through/aspect-lock geometry is covered directly against
  // Selection in selection.test.js; these assert the controller wires mouse events to
  // the right model.selection.* method, not the resulting numbers.

  test('mousedown on a handle begins a resize gesture on the model', async () => {
    await setupFloatingLayer(); // box: x20 y20 w40 h40 -> se handle at (60,60)
    const beginResizeSpy = vi.spyOn(model.selection, 'beginResize');

    dispatchMouseDown({ clientX: 60, clientY: 60 });

    expect(beginResizeSpy).toHaveBeenCalledWith('se');
    expect(controller.selectionDrag).toBeTruthy();
  });

  test('mousedown inside the box (not on a handle) begins a move gesture on the model', async () => {
    await setupFloatingLayer();
    const beginMoveSpy = vi.spyOn(model.selection, 'beginMove');

    dispatchMouseDown({ clientX: 40, clientY: 40 }); // center, well clear of any handle

    expect(beginMoveSpy).toHaveBeenCalledWith({ x: 40, y: 40 });
    expect(controller.selectionDrag).toBeTruthy();
  });

  test('mousemove while dragging forwards coords and shiftKey to model.selection.applyDrag', async () => {
    await setupFloatingLayer();
    dispatchMouseDown({ clientX: 40, clientY: 40 });
    const applyDragSpy = vi.spyOn(model.selection, 'applyDrag');

    dispatchMouseMove({ clientX: 50, clientY: 55, shiftKey: true });

    expect(applyDragSpy).toHaveBeenCalledWith({ x: 50, y: 55 }, true);
    expect(fakeView.render).toHaveBeenCalled();
  });

  test('mouseup ends the drag', async () => {
    await setupFloatingLayer();
    dispatchMouseDown({ clientX: 40, clientY: 40 });
    const endDragSpy = vi.spyOn(model.selection, 'endDrag');

    dispatchMouseUp();

    expect(endDragSpy).toHaveBeenCalled();
    expect(controller.selectionDrag).toBeNull();
  });

  test('mousedown outside the box commits the floating layer, then starts a normal selection drag from there', async () => {
    await setupFloatingLayer();

    dispatchMouseDown({ clientX: 150, clientY: 150 });

    // isSelecting/startPos are the last things set, after the commit's async chain
    // settles - waiting on them (rather than the earlier hasFloatingLayer() flip)
    // avoids racing the intermediate microtask.
    await vi.waitFor(() => expect(controller.isSelecting).toBe(true));
    expect(model.hasFloatingLayer()).toBe(false);
    expect(model.mainImage.pixel_color(30, 30)).toStrictEqual(BLACK); // committed at its original bounds
    expect(controller.selectionDrag).toBeNull();
    expect(controller.startPos).toStrictEqual({ x: 150, y: 150 });
  });

  test('dragging from outside the box commits, then draws a fresh selection from the drag', async () => {
    await setupFloatingLayer();

    dispatchMouseDown({ clientX: 150, clientY: 150 });
    await vi.waitFor(() => expect(controller.isSelecting).toBe(true));
    dispatchMouseMove({ clientX: 170, clientY: 180 });

    expect(model.selection).toMatchObject({ type: 'rect', x: 150, y: 150, w: 20, h: 30 });
  });
});

describe('floating layer commit triggers', () => {
  async function setupFloatingLayer(x = 20, y = 20, w = 40, h = 40) {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x, y, w, h });
    await model.pasteIntoSelection(await create_solid_png_buffer(w, h, BLACK));
  }

  test('shape toggle re-shapes the floating layer in place instead of committing it', async () => {
    await setupFloatingLayer();

    document.getElementById('shape-toggle-btn').dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => expect(fakeView.setShapeMode).toHaveBeenCalledWith('ellipse'));
    expect(model.hasFloatingLayer()).toBe(true); // still floating, not committed
    expect(model.selection.type).toBe('ellipse'); // the new shape applied to it
    expect(model.mainImage.pixel_color(30, 30)).toStrictEqual(WHITE); // mainImage untouched
    expect(model.shapeMode).toBe('ellipse'); // the default for the next selection flipped too
  });
});

describe('toolbar clicks while a floating layer is active', () => {
  async function setupFloatingLayer(x = 20, y = 20, w = 40, h = 40) {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x, y, w, h });
    await model.pasteIntoSelection(await create_solid_png_buffer(w, h, BLACK));
  }

  // Regression test for the bug where a real click (mousedown -> mouseup -> click)
  // on a toolbar button bubbled through the window-level mousedown/mouseup listeners
  // first: mousedown saw the click as "outside the floating box" and committed it,
  // then mouseup reset model.selection to null before the button's own click handler
  // (e.g. rotate) ever ran.
  test('a real mousedown+mouseup+click on a toolbar button rotates the floating layer in place instead of committing it', async () => {
    await setupFloatingLayer();
    const rotateSpy = vi.spyOn(model.selection, 'rotate');
    const btn = document.getElementById('rotate-btn');

    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    btn.dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.hasFloatingLayer()).toBe(true);
    expect(rotateSpy).toHaveBeenCalledWith('cw');
    expect(fakeView.render).toHaveBeenCalled();
  });
});

describe('handleManipulate / toolbar button wiring', () => {
  test.each([
    ['flip-horizontally-btn', 'flipH'],
    ['flip-vertically-btn', 'flipV'],
    ['rotate-btn', 'rotateCW'],
  ])('%s calls manipulateSelection with %s and re-renders', async (id, direction) => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ x: 0, y: 0, w: 100, h: 100 });
    const manipulateSpy = vi.spyOn(model, 'manipulateSelection');

    document.getElementById(id).dispatchEvent(new Event('click', { bubbles: true }));

    expect(manipulateSpy).toHaveBeenCalledWith(direction);
    expect(fakeView.render).toHaveBeenCalled();
  });

  test('no-ops without a selection', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    const manipulateSpy = vi.spyOn(model, 'manipulateSelection');

    document.getElementById('rotate-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(manipulateSpy).not.toHaveBeenCalled();
    expect(fakeView.render).not.toHaveBeenCalled();
  });
});

describe('handleReset / reset-btn', () => {
  test('calls model.clear() and view.clearCanvas()', () => {
    const clearSpy = vi.spyOn(model, 'clear');

    document.getElementById('reset-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(clearSpy).toHaveBeenCalled();
    expect(fakeView.clearCanvas).toHaveBeenCalled();
  });
});

describe('handleTransparencyToggle / transparency-toggle', () => {
  test('turns alphaKey on and forwards it to view.setAlphaColor', () => {
    model.alphaKey = null;

    document.getElementById('transparency-toggle').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.alphaKey).toStrictEqual({ r: 255, g: 255, b: 255 });
    expect(fakeView.setAlphaColor).toHaveBeenCalledWith({ r: 255, g: 255, b: 255 });
  });

  test('turns alphaKey back off and forwards null', () => {
    model.alphaKey = { r: 255, g: 255, b: 255 };

    document.getElementById('transparency-toggle').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.alphaKey).toBeNull();
    expect(fakeView.setAlphaColor).toHaveBeenCalledWith(null);
  });

  test('does not error when there is no floating layer', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.alphaKey = null;

    document.getElementById('transparency-toggle').dispatchEvent(new Event('click', { bubbles: true }));

    expect(fakeView.render).toHaveBeenCalledWith(model.mainImage, model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
  });

  test('does not render when the canvas is empty', () => {
    model.alphaKey = null;

    document.getElementById('transparency-toggle').dispatchEvent(new Event('click', { bubbles: true }));

    expect(fakeView.render).not.toHaveBeenCalled();
  });

  test('re-renders live when a floating layer is active', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 40, h: 40 });
    await model.pasteIntoSelection(await create_solid_png_buffer(40, 40, BLACK));

    document.getElementById('transparency-toggle').dispatchEvent(new Event('click', { bubbles: true }));

    expect(fakeView.render).toHaveBeenCalledWith(model.mainImage, model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
  });
});

describe('handleToleranceChange / tolerance-slider', () => {
  test('updates model.colorTolerance from the slider value', () => {
    const slider = document.getElementById('tolerance-slider');
    slider.value = '42';

    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(model.colorTolerance).toBe(42);
  });

  test('does not re-render when there is no floating layer', () => {
    const slider = document.getElementById('tolerance-slider');
    slider.value = '42';

    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(fakeView.render).not.toHaveBeenCalled();
  });

  test('re-renders live when a floating layer is active', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 40, h: 40 });
    await model.pasteIntoSelection(await create_solid_png_buffer(40, 40, BLACK));
    const slider = document.getElementById('tolerance-slider');
    slider.value = '42';

    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(fakeView.render).toHaveBeenCalledWith(model.mainImage, model.selection, model.alphaKey, 42, model.shapeExponent);
  });
});

describe('handleShapeExponentChange / shape-slider', () => {
  test('updates model.shapeExponent from the slider value', () => {
    const slider = document.getElementById('shape-slider');
    slider.value = '4';

    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(model.shapeExponent).toBe(4);
  });

  test('does not touch the view when there is no selection', () => {
    const slider = document.getElementById('shape-slider');
    slider.value = '4';

    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(fakeView.drawSelection).not.toHaveBeenCalled();
  });

  test('redraws the outline live for a marquee selection and refreshes the pending copy blob', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ type: 'ellipse', x: 0, y: 0, w: 40, h: 40 });
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');
    const slider = document.getElementById('shape-slider');
    slider.value = '4';

    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection, model.alphaKey, model.colorTolerance, 4);
    expect(updateCopyBlobSpy).toHaveBeenCalled();
  });

  test('redraws the floating preview live but leaves the pending copy blob alone', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ type: 'ellipse', x: 0, y: 0, w: 40, h: 40 });
    await model.pasteIntoSelection(await create_solid_png_buffer(40, 40, BLACK));
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');
    const slider = document.getElementById('shape-slider');
    slider.value = '4';

    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection, model.alphaKey, model.colorTolerance, 4);
    expect(updateCopyBlobSpy).not.toHaveBeenCalled();
  });

  test('desktop slider updates its hint-wrap tooltip with the live value', () => {
    const slider = document.getElementById('shape-slider');
    slider.value = '4';

    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(slider.closest('.hint-wrap').dataset.hint).toBe('Roundness: 4');
  });

  test('mobile drawer slider has no hint-wrap ancestor and does not error', () => {
    const slider = document.getElementById('shape-slider-mobile');
    slider.value = '4';

    expect(() => slider.dispatchEvent(new Event('input', { bubbles: true }))).not.toThrow();
    expect(slider.closest('.hint-wrap')).toBeNull();
  });
});

describe('desktop/mobile toolbar wiring', () => {
  // Controls duplicated between the desktop toolbar and the mobile one (primary bar
  // and/or hidden drawer) share a js- class in index.html so one addEventListener
  // pass wires every instance - these confirm the mobile instances actually fire.
  test.each([
    'flip-horizontally-btn-mobile',
    'flip-vertically-btn-mobile',
    'rotate-btn-mobile',
  ])('%s calls manipulateSelection and re-renders same as its desktop counterpart', async (id) => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ x: 0, y: 0, w: 100, h: 100 });
    const manipulateSpy = vi.spyOn(model, 'manipulateSelection');

    document.getElementById(id).dispatchEvent(new Event('click', { bubbles: true }));

    expect(manipulateSpy).toHaveBeenCalled();
    expect(fakeView.render).toHaveBeenCalled();
  });

  test.each(['shape-toggle-btn-mobile', 'shape-toggle-btn-mobile-drawer'])(
    '%s toggles shape mode the same way the desktop button does',
    (id) => {
      expect(model.shapeMode).toBe('rect');

      document.getElementById(id).dispatchEvent(new Event('click', { bubbles: true }));

      expect(model.shapeMode).toBe('ellipse');
      expect(fakeView.setShapeMode).toHaveBeenCalledWith('ellipse');
    }
  );

  test('reset-btn-mobile calls model.clear() and view.clearCanvas()', () => {
    const clearSpy = vi.spyOn(model, 'clear');

    document.getElementById('reset-btn-mobile').dispatchEvent(new Event('click', { bubbles: true }));

    expect(clearSpy).toHaveBeenCalled();
    expect(fakeView.clearCanvas).toHaveBeenCalled();
  });

  test('alpha-pick-btn-mobile arms the alpha color picker same as the desktop button', () => {
    document.getElementById('alpha-pick-btn-mobile').dispatchEvent(new Event('click', { bubbles: true }));

    expect(fakeView.setAlphaPickArmed).toHaveBeenCalledWith(true);
  });

  test('transparency-toggle-mobile turns alphaKey on and forwards it to view.setAlphaColor', () => {
    model.alphaKey = null;

    document.getElementById('transparency-toggle-mobile').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.alphaKey).toStrictEqual({ r: 255, g: 255, b: 255 });
    expect(fakeView.setAlphaColor).toHaveBeenCalledWith({ r: 255, g: 255, b: 255 });
  });

  test('tolerance-slider-mobile updates model.colorTolerance from the slider value', () => {
    const slider = document.getElementById('tolerance-slider-mobile');
    slider.value = '42';

    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(model.colorTolerance).toBe(42);
  });

  test('paste-btn-mobile and copy-share-btn-mobile exist as distinct elements from their desktop counterparts', () => {
    expect(document.getElementById('paste-btn-mobile')).not.toBe(document.getElementById('paste-btn'));
    expect(document.getElementById('copy-share-btn-mobile')).not.toBe(document.getElementById('copy-share-btn'));
  });
});

describe('help panels', () => {
  test('help-btn toggles the desktop help-panel only', () => {
    document.getElementById('help-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(document.getElementById('help-panel').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('help-panel-mobile').classList.contains('hidden')).toBe(true);

    document.getElementById('help-btn').dispatchEvent(new Event('click', { bubbles: true }));
    expect(document.getElementById('help-panel').classList.contains('hidden')).toBe(true);
  });

  test('help-btn-mobile toggles the mobile help-panel only', () => {
    document.getElementById('help-btn-mobile').dispatchEvent(new Event('click', { bubbles: true }));

    expect(document.getElementById('help-panel-mobile').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('help-panel').classList.contains('hidden')).toBe(true);

    document.getElementById('help-btn-mobile').dispatchEvent(new Event('click', { bubbles: true }));
    expect(document.getElementById('help-panel-mobile').classList.contains('hidden')).toBe(true);
  });

  test('clicking outside an open mobile help-panel closes it', () => {
    document.getElementById('help-btn-mobile').dispatchEvent(new Event('click', { bubbles: true }));
    expect(document.getElementById('help-panel-mobile').classList.contains('hidden')).toBe(false);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.getElementById('help-panel-mobile').classList.contains('hidden')).toBe(true);
  });
});

describe('touch support', () => {
  // jsdom doesn't support the native TouchEvent/Touch constructors, so - same as
  // dispatchPaste's manually-attached clipboardData - attach plain touches/changedTouches
  // arrays of { clientX, clientY } objects to a plain Event.
  function dispatchTouchStart(touches) {
    const event = new Event('touchstart', { bubbles: true, cancelable: true });
    event.touches = touches;
    window.dispatchEvent(event);
    return event;
  }
  function dispatchTouchMove(touches) {
    const event = new Event('touchmove', { bubbles: true, cancelable: true });
    event.touches = touches;
    window.dispatchEvent(event);
    return event;
  }
  function dispatchTouchEnd(changedTouches, touches = []) {
    const event = new Event('touchend', { bubbles: true, cancelable: true });
    event.touches = touches;
    event.changedTouches = changedTouches;
    window.dispatchEvent(event);
    return event;
  }

  test('single-touch drag draws a selection, same as a mouse drag', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));

    dispatchTouchStart([{ clientX: 10, clientY: 20 }]);
    dispatchTouchMove([{ clientX: 40, clientY: 50 }]);

    expect(model.selection).toMatchObject({ type: 'rect', x: 10, y: 20, w: 30, h: 30 });
    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
  });

  test('touchend finalizes the selection and updates the copy blob, mirroring mouseup', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');
    dispatchTouchStart([{ clientX: 10, clientY: 20 }]);
    dispatchTouchMove([{ clientX: 40, clientY: 50 }]);

    dispatchTouchEnd([{ clientX: 40, clientY: 50 }]);

    expect(controller.isSelecting).toBe(false);
    await vi.waitFor(() => expect(updateCopyBlobSpy).toHaveBeenCalled());
  });

  test('touch move/resize a Floating Layer via drag, with no aspect-ratio lock', async () => {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x: 20, y: 20, w: 40, h: 40 });
    await model.pasteIntoSelection(await create_solid_png_buffer(40, 40, BLACK));
    const beginMoveSpy = vi.spyOn(model.selection, 'beginMove');
    const applyDragSpy = vi.spyOn(model.selection, 'applyDrag');

    dispatchTouchStart([{ clientX: 40, clientY: 40 }]); // center, clear of any handle
    expect(beginMoveSpy).toHaveBeenCalledWith({ x: 40, y: 40 });
    expect(controller.selectionDrag).toBeTruthy();

    dispatchTouchMove([{ clientX: 50, clientY: 55 }]);
    expect(applyDragSpy).toHaveBeenCalledWith({ x: 50, y: 55 }, false);

    dispatchTouchEnd([{ clientX: 50, clientY: 55 }]);
    expect(controller.selectionDrag).toBeNull();
  });

  test('multi-touch is ignored: a two-finger touchstart does not begin a drag', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));

    dispatchTouchStart([{ clientX: 10, clientY: 10 }, { clientX: 50, clientY: 50 }]);

    expect(controller.isSelecting).toBe(false);
    expect(model.selection).toBeNull();
  });

  test('a two-finger touchmove does not act, even mid-drag', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    dispatchTouchStart([{ clientX: 10, clientY: 10 }]);

    dispatchTouchMove([{ clientX: 20, clientY: 20 }, { clientX: 60, clientY: 60 }]);

    expect(model.selection).toBeNull();
  });

  test('passes isTouch=true to view.hitTestHandle when routing a touchstart, and false for a mousedown', async () => {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x: 20, y: 20, w: 40, h: 40 });

    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 40, clientY: 40 }));
    expect(fakeView.hitTestHandle).toHaveBeenLastCalledWith({ x: 20, y: 20, w: 40, h: 40 }, { x: 40, y: 40 }, false);

    dispatchTouchStart([{ clientX: 40, clientY: 40 }]);
    expect(fakeView.hitTestHandle).toHaveBeenLastCalledWith({ x: 20, y: 20, w: 40, h: 40 }, { x: 40, y: 40 }, true);
  });
});

describe('Alpha Color Picker toggle', () => {
  function dispatchTouchStart(touches) {
    const event = new Event('touchstart', { bubbles: true, cancelable: true });
    event.touches = touches;
    window.dispatchEvent(event);
  }
  function dispatchMouseDown(opts = {}) {
    window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...opts }));
  }

  test('clicking the toggle button arms the picker, updates the view, and closes the mobile drawer', () => {
    document.getElementById('drawer').classList.remove('hidden');
    expect(controller.alphaPickArmed).toBe(false);

    document.getElementById('alpha-pick-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(controller.alphaPickArmed).toBe(true);
    expect(fakeView.setAlphaPickArmed).toHaveBeenCalledWith(true);
    expect(document.getElementById('drawer').classList.contains('hidden')).toBe(true);
  });

  test('clicking again disarms it and also closes the drawer', () => {
    document.getElementById('alpha-pick-btn').dispatchEvent(new Event('click', { bubbles: true }));
    document.getElementById('drawer').classList.remove('hidden');

    document.getElementById('alpha-pick-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(controller.alphaPickArmed).toBe(false);
    expect(fakeView.setAlphaPickArmed).toHaveBeenLastCalledWith(false);
    expect(document.getElementById('drawer').classList.contains('hidden')).toBe(true);
  });

  test('while armed, a plain touchstart on the Canvas samples the Alpha Key and disarms the picker', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK));
    controller.alphaPickArmed = true;

    dispatchTouchStart([{ clientX: 0, clientY: 0 }]);

    expect(model.alphaKey).toStrictEqual(BLACK);
    expect(fakeView.setAlphaColor).toHaveBeenCalledWith(BLACK);
    expect(controller.alphaPickArmed).toBe(false);
    expect(fakeView.setAlphaPickArmed).toHaveBeenCalledWith(false);
  });

  test('while armed, a plain mousedown (no altKey held) also samples via the same path and disarms', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK));
    controller.alphaPickArmed = true;

    dispatchMouseDown({ clientX: 0, clientY: 0 });

    expect(model.alphaKey).toStrictEqual(BLACK);
    expect(controller.alphaPickArmed).toBe(false);
  });

  test('auto-disarms after a sample - a second tap without re-arming falls through to a selection drag', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK));
    controller.alphaPickArmed = true;

    dispatchTouchStart([{ clientX: 0, clientY: 0 }]);
    expect(controller.alphaPickArmed).toBe(false);
    expect(model.alphaKey).toStrictEqual(BLACK);

    dispatchTouchStart([{ clientX: 10, clientY: 10 }]);

    expect(model.alphaKey).toStrictEqual(BLACK); // unchanged - second tap wasn't a sample
    expect(controller.isSelecting).toBe(true); // fell through to a normal selection drag instead
  });

  test('toggling off stops sampling on tap', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK));
    controller.alphaPickArmed = true;
    document.getElementById('alpha-pick-btn').dispatchEvent(new Event('click', { bubbles: true }));
    expect(controller.alphaPickArmed).toBe(false);

    dispatchTouchStart([{ clientX: 0, clientY: 0 }]);

    expect(model.alphaKey).toBeNull();
    expect(controller.isSelecting).toBe(true); // fell through to a normal selection drag instead
  });
});

describe('Paste button', () => {
  function fakeClipboardReadItem(buffer, type = 'image/png') {
    return { types: [type], getType: async () => new Blob([buffer], { type }) };
  }

  test('reads the clipboard and pastes the image on success', async () => {
    const buffer = await create_solid_png_buffer(60, 40, WHITE);
    navigator.clipboard.read.mockResolvedValueOnce([fakeClipboardReadItem(buffer)]);
    const createNewSpy = vi.spyOn(model, 'createNew');

    document.getElementById('paste-btn').dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => expect(createNewSpy).toHaveBeenCalled());
    await vi.waitFor(() => expect(fakeView.render).toHaveBeenCalled());
  });

  test('warns to copy an image, without opening the file picker, when clipboard.read() rejects', async () => {
    navigator.clipboard.read.mockRejectedValueOnce(new Error('denied'));
    const input = document.getElementById('file-input');
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
    clickSpy.mockClear();

    document.getElementById('paste-btn').dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => expect(fakeBus.report).toHaveBeenCalledWith('warning', expect.any(String), expect.any(Error)));
    expect(clickSpy).not.toHaveBeenCalled();
  });

  test('warns to copy an image when the clipboard has no image item', async () => {
    navigator.clipboard.read.mockResolvedValueOnce([{ types: ['text/plain'], getType: async () => new Blob(['x']) }]);
    const input = document.getElementById('file-input');
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
    clickSpy.mockClear();

    document.getElementById('paste-btn').dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => expect(fakeBus.report).toHaveBeenCalledWith('warning', expect.any(String), expect.any(Error)));
    expect(clickSpy).not.toHaveBeenCalled();
  });

  test('stays silent (no report) when the Clipboard read API is unavailable', async () => {
    const original = navigator.clipboard;
    navigator.clipboard = { write: vi.fn() }; // no read - simulates an insecure context

    document.getElementById('paste-btn').dispatchEvent(new Event('click', { bubbles: true }));
    await Promise.resolve();

    expect(fakeBus.report).not.toHaveBeenCalled();
    navigator.clipboard = original;
  });

  test('a Model failure dispatches an error-level report and does not render', async () => {
    const buffer = await create_solid_png_buffer(60, 40, WHITE);
    navigator.clipboard.read.mockResolvedValueOnce([fakeClipboardReadItem(buffer)]);
    const modelError = new Error('Jimp decode failed');
    vi.spyOn(model, 'createNew').mockRejectedValueOnce(modelError);

    document.getElementById('paste-btn').dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => expect(fakeBus.report).toHaveBeenCalledWith('error', expect.any(String), modelError));
    expect(fakeView.render).not.toHaveBeenCalled();
  });
});

describe('Open button', () => {
  test('opens the file picker on click', () => {
    const input = document.getElementById('file-input');
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});
    clickSpy.mockClear();

    document.getElementById('open-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(clickSpy).toHaveBeenCalled();
  });

  test('a chosen file funnels into the same paste logic', async () => {
    const buffer = await create_solid_png_buffer(60, 40, WHITE);
    const file = new File([buffer], 'image.png', { type: 'image/png' });
    const input = document.getElementById('file-input');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    const createNewSpy = vi.spyOn(model, 'createNew');

    input.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(createNewSpy).toHaveBeenCalled());
    await vi.waitFor(() => expect(fakeView.render).toHaveBeenCalled());
  });
});

describe('Copy/Share button', () => {
  test('does nothing when there is no pending blob and no floating layer', () => {
    model.pendingCopyBlob = null;

    document.getElementById('copy-share-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(navigator.clipboard.write).not.toHaveBeenCalled();
  });

  test('writes to the clipboard with a ClipboardItem when a blob is pending', async () => {
    model.pendingCopyBlob = new Blob(['x'], { type: 'image/png' });

    document.getElementById('copy-share-btn').dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledWith([expect.any(ClipboardItem)]));
  });

  test('falls back to navigator.share with the same blob when clipboard.write() fails', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    model.pendingCopyBlob = blob;
    navigator.clipboard.write.mockRejectedValueOnce(new Error('unsupported'));

    document.getElementById('copy-share-btn').dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => expect(navigator.share).toHaveBeenCalled());
    const [{ files }] = navigator.share.mock.calls[0];
    expect(files[0].type).toBe('image/png');
    expect(await files[0].arrayBuffer()).toStrictEqual(await blob.arrayBuffer());
    expect(fakeBus.report).toHaveBeenCalledWith('warning', expect.any(String), expect.any(Error));
  });

  test('does not throw when navigator.share is unsupported', async () => {
    model.pendingCopyBlob = new Blob(['x'], { type: 'image/png' });
    navigator.clipboard.write.mockRejectedValueOnce(new Error('unsupported'));
    const originalShare = navigator.share;
    navigator.share = undefined;

    document.getElementById('copy-share-btn').dispatchEvent(new Event('click', { bubbles: true }));
    await vi.waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalled());

    navigator.share = originalShare;
  });

  test('commits the floating layer first, then copies the now-updated canvas region', async () => {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x: 50, y: 50, w: 100, h: 100 });
    await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

    document.getElementById('copy-share-btn').dispatchEvent(new Event('click', { bubbles: true }));

    await vi.waitFor(() => expect(model.hasFloatingLayer()).toBe(false));
    expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(BLACK);
    await vi.waitFor(() => expect(navigator.clipboard.write).toHaveBeenCalledWith([expect.any(ClipboardItem)]));
  });
});

describe('Select All / Cancel / Undo / Redo buttons', () => {
  test('select-all-btn selects the full image, updates the copy blob, and draws the selection', async () => {
    await model.createNew(await create_solid_png_buffer(120, 80, WHITE));
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');

    document.getElementById('select-all-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.selection).toMatchObject({ type: 'rect', x: 0, y: 0, w: 120, h: 80 });
    expect(updateCopyBlobSpy).toHaveBeenCalled();
    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection, model.alphaKey, model.colorTolerance, model.shapeExponent);
  });

  test('select-all-btn does nothing on an empty model', () => {
    document.getElementById('select-all-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.selection).toBeNull();
  });

  test('cancel-btn cancels the floating layer', async () => {
    await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
    model.selection = new Selection({ type: 'rect', x: 50, y: 50, w: 100, h: 100 });
    await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

    document.getElementById('cancel-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.hasFloatingLayer()).toBe(false);
    expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(WHITE);
  });

  test('cancel-btn clears the selection when no floating layer, like keyboard Escape', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = new Selection({ type: 'rect', x: 10, y: 10, w: 30, h: 30 });
    const historyLengthBefore = model.history.length;

    document.getElementById('cancel-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.selection).toBeNull();
    expect(fakeView.drawSelection).toHaveBeenLastCalledWith(null);
    expect(model.history).toHaveLength(historyLengthBefore);
  });

  test('undo-btn undoes and re-renders', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    await model.createNew(await create_solid_png_buffer(110, 100, WHITE));

    document.getElementById('undo-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.mainImage.width).toBe(100);
    expect(fakeView.render).toHaveBeenCalled();
  });

  test('redo-btn redoes and re-renders', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    await model.createNew(await create_solid_png_buffer(110, 100, WHITE));
    model.undo();
    fakeView.render.mockClear();

    document.getElementById('redo-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.mainImage.width).toBe(110);
    expect(fakeView.render).toHaveBeenCalled();
  });

  test('undo-btn/redo-btn are suppressed while a floating layer is active', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    await model.createNew(await create_solid_png_buffer(110, 100, WHITE));
    model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 50, h: 50 });
    await model.pasteIntoSelection(await create_solid_png_buffer(50, 50, BLACK));
    const historyBefore = [...model.history];

    document.getElementById('undo-btn').dispatchEvent(new Event('click', { bubbles: true }));
    document.getElementById('redo-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.history).toStrictEqual(historyBefore);
    expect(model.hasFloatingLayer()).toBe(true);
  });
});
