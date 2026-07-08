// @vitest-environment jsdom
import { expect, test, describe, beforeAll, beforeEach, vi } from 'vitest'
import ImageController from '../image_controller.js'
import ImageModel from '../image_model.js'
import { mountFixture } from './dom_helpers.js'
import { create_solid_png_buffer } from './test_helpers.js'

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

function makeFakeView() {
  return {
    render: vi.fn(),
    drawSelection: vi.fn(),
    setAlphaColor: vi.fn(),
    clearCanvas: vi.fn(),
    setShapeMode: vi.fn(),
    imgCanvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    zoom: 1,
  };
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

// Constructed once for the whole file (see PRD decision 6): initListeners
// registers window-level listeners with no teardown, so a fresh controller
// per test would accumulate stale listeners firing against later state.
let controller, model, fakeView;

beforeAll(() => {
  mountFixture();
  model = new ImageModel();
  fakeView = makeFakeView();
  controller = new ImageController(model, fakeView);
});

beforeEach(() => {
  model = new ImageModel();
  fakeView = makeFakeView();
  controller.model = model;
  controller.view = fakeView;
  controller.isSelecting = false;
  navigator.clipboard.write.mockClear();
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
    model.selection = { x: 0, y: 0, w: 50, h: 50 };
    const pasteSpy = vi.spyOn(model, 'pasteIntoSelection');
    const buffer = await create_solid_png_buffer(50, 50, BLACK);

    dispatchPaste([{ type: 'image/png', kind: 'file', ...fakeImageFile(buffer) }]);

    await vi.waitFor(() => expect(pasteSpy).toHaveBeenCalled());
    await vi.waitFor(() => expect(fakeView.render).toHaveBeenCalled());
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

  test('Ctrl/Cmd+A selects the full image, updates the copy blob, and draws the selection', async () => {
    await model.createNew(await create_solid_png_buffer(120, 80, WHITE));
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');

    dispatchKey('a', { ctrlKey: true });

    expect(model.selection).toStrictEqual({ type: 'rect', x: 0, y: 0, w: 120, h: 80 });
    expect(updateCopyBlobSpy).toHaveBeenCalled();
    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection);
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

    expect(model.selection).toStrictEqual({ type: 'rect', x: 0, y: 0, w: 120, h: 80 });
    expect(model.shapeMode).toBe('ellipse'); // Select All neither reads nor writes shape mode
  });

  test('Escape clears isSelecting and selection', () => {
    controller.isSelecting = true;
    model.selection = { x: 0, y: 0, w: 10, h: 10 };

    dispatchKey('Escape');

    expect(controller.isSelecting).toBe(false);
    expect(model.selection).toBeNull();
    expect(fakeView.drawSelection).toHaveBeenCalledWith(null);
  });

  test('r/h/v trigger manipulateSelection with the right direction when a selection exists', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = { x: 0, y: 0, w: 100, h: 100 };
    const manipulateSpy = vi.spyOn(model, 'manipulateSelection');

    dispatchKey('r');
    expect(manipulateSpy).toHaveBeenLastCalledWith('rotateCW');

    dispatchKey('h');
    expect(manipulateSpy).toHaveBeenLastCalledWith('flipH');

    dispatchKey('v');
    expect(manipulateSpy).toHaveBeenLastCalledWith('flipV');

    expect(fakeView.render).toHaveBeenCalled();
  });

  test('shift+r maps to rotateCCW', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = { x: 0, y: 0, w: 100, h: 100 };
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

    dispatchKey(' ');

    expect(model.selection.type).toBe('ellipse');
    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection);
  });
});

describe('shape-toggle-btn', () => {
  test('clicking toggles shape mode the same way spacebar does', () => {
    expect(model.shapeMode).toBe('rect');

    document.getElementById('shape-toggle-btn').dispatchEvent(new Event('click', { bubbles: true }));

    expect(model.shapeMode).toBe('ellipse');
    expect(fakeView.setShapeMode).toHaveBeenCalledWith('ellipse');
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

  test('alt+shift+click clears alphaKey', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.alphaKey = BLACK;

    dispatchMouseDown({ clientX: 0, clientY: 0, altKey: true, shiftKey: true });

    expect(model.alphaKey).toBeNull();
    expect(fakeView.setAlphaColor).toHaveBeenCalledWith(null);
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

    expect(model.selection).toStrictEqual({ type: 'rect', x: 20, y: 30, w: 30, h: 20 });
    expect(fakeView.drawSelection).toHaveBeenCalledWith(model.selection);
  });
});

describe('handleMouseUp', () => {
  function dispatchMouseUp() {
    window.dispatchEvent(new Event('mouseup'));
  }

  test('collapses a zero-width/height drag back to selection = null', async () => {
    controller.isSelecting = true;
    model.selection = { x: 10, y: 10, w: 0, h: 5 };

    dispatchMouseUp();

    expect(model.selection).toBeNull();
  });

  test('calls model.updateCopyBlob when a non-empty selection resulted', async () => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    controller.isSelecting = true;
    model.selection = { x: 0, y: 0, w: 10, h: 10 };
    const updateCopyBlobSpy = vi.spyOn(model, 'updateCopyBlob');

    dispatchMouseUp();

    await vi.waitFor(() => expect(updateCopyBlobSpy).toHaveBeenCalled());
  });
});

describe('handleManipulate / toolbar button wiring', () => {
  test.each([
    ['flip-horizontally-btn', 'flipH'],
    ['flip-vertically-btn', 'flipV'],
    ['rotate-btn', 'rotateCW'],
  ])('%s calls manipulateSelection with %s and re-renders', async (id, direction) => {
    await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
    model.selection = { x: 0, y: 0, w: 100, h: 100 };
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
});

describe('handleToleranceChange / tolerance-slider', () => {
  test('updates model.colorTolerance from the slider value', () => {
    const slider = document.getElementById('tolerance-slider');
    slider.value = '42';

    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(model.colorTolerance).toBe(42);
  });
});
