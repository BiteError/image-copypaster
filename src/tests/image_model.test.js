import { expect, test } from 'vitest'
import ImageModel, { toleranceToDistance } from '../image_model.js'
import Selection from '../selection.js'
import { CreateBitmap } from '../bitmap.js'
import { create_solid_png_buffer } from './test_helpers.js'

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

test('starts empty with no history or selection', () => {
  const model = new ImageModel();

  expect(model.isEmpty()).toBeTruthy();
  expect(model.notEmpty()).toBeFalsy();
  expect(model.selection).toBeNull();
  expect(model.shapeMode).toBe('rect');
  expect(model.alphaKey).toBeNull();
  expect(model.colorTolerance).toBe(10);
  expect(model.pendingCopyBlob).toBeNull();
  expect(model.history).toHaveLength(0);
});

test('createNew loads a bitmap, clears selection, and records history', async () => {
  const model = new ImageModel();

  await model.createNew(await create_solid_png_buffer(120, 100, WHITE));

  expect(model.isEmpty()).toBeFalsy();
  expect(model.mainImage.width).toBe(120);
  expect(model.mainImage.height).toBe(100);
  expect(model.selection).toBeNull();
  expect(model.history).toHaveLength(1);
});

test('clear resets to an empty bitmap and records history', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(120, 100, WHITE));
  model.selection = new Selection({ x: 0, y: 0, w: 5, h: 5 });

  await model.clear();

  expect(model.isEmpty()).toBeTruthy();
  expect(model.selection).toBeNull();
  expect(model.history).toHaveLength(2);
});

test('undo returns null when there is nothing to undo to', () => {
  const model = new ImageModel();
  expect(model.undo()).toBeNull();
});

test('redo returns null when there is nothing to redo', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(120, 100, WHITE));

  expect(model.redo()).toBeNull();
});

test('undo restores the previous image and redo restores it back', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  await model.createNew(await create_solid_png_buffer(110, 100, WHITE));

  const undone = model.undo();
  expect(undone.width).toBe(100);
  expect(model.mainImage.width).toBe(100);

  const redone = model.redo();
  expect(redone.width).toBe(110);
  expect(model.mainImage.width).toBe(110);
});

test('a new action clears the redo stack', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  await model.createNew(await create_solid_png_buffer(110, 100, WHITE));
  model.undo();
  expect(model.redoStack).toHaveLength(1);

  await model.createNew(await create_solid_png_buffer(120, 100, WHITE));

  expect(model.redoStack).toHaveLength(0);
  expect(model.redo()).toBeNull();
});

test('history is capped at 6 entries, dropping the oldest', async () => {
  const model = new ImageModel();
  for (let i = 0; i < 8; i++) {
    await model.createNew(await create_solid_png_buffer(100 + i, 100, WHITE));
  }

  expect(model.history).toHaveLength(6);
  expect(model.history[0].width).toBe(102); // first two (100, 101) were dropped
  expect(model.history[5].width).toBe(107);
});

test('pasteIntoSelection is a no-op on an empty model', async () => {
  const model = new ImageModel();
  model.selection = new Selection({ x: 0, y: 0, w: 100, h: 100 });

  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

  expect(model.isEmpty()).toBeTruthy();
  expect(model.pendingCopyBlob).toBeNull();
  expect(model.hasFloatingLayer()).toBe(false);
});

test('pasteIntoSelection is a no-op without an active selection', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));

  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE);
  expect(model.pendingCopyBlob).toBeNull();
  expect(model.hasFloatingLayer()).toBe(false);
});

test('pasteIntoSelection turns the selection floating, sized to its own bounds, without touching mainImage or history', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = new Selection({ type: 'rect', x: 50, y: 50, w: 100, h: 100 });
  const historyLengthBefore = model.history.length;

  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

  expect(model.hasFloatingLayer()).toBe(true);
  expect(model.selection).toMatchObject({ x: 50, y: 50, w: 100, h: 100, rotation: 0, flipH: false, flipV: false });
  expect(model.selection.original.width).toBe(100);
  expect(model.selection.original.height).toBe(100);
  expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(WHITE);
  expect(model.mainImage.pixel_color(149, 149)).toStrictEqual(WHITE);
  expect(model.history).toHaveLength(historyLengthBefore);
});

test('pasteIntoSelection with an ellipse selection turns it floating, sized to the bounds', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = new Selection({ type: 'ellipse', x: 0, y: 0, w: 100, h: 100 });

  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

  expect(model.selection).toMatchObject({ x: 0, y: 0, w: 100, h: 100 });
  // ellipse masking is applied at render/commit time, not at paste time
  expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(WHITE);
});

test('pasteIntoSelection strips pixels matching the alpha key from the floating bitmap', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = new Selection({ x: 50, y: 50, w: 100, h: 100 });
  model.alphaKey = BLACK;

  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK)); // matches alpha key

  // the whole pasted patch matched the alpha key, so it's transparent before it ever floats
  const data = model.selection.original.data();
  expect(data[3]).toBe(0);
});

test('pasteIntoSelection strips near-matching pixels when colorTolerance allows it', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = new Selection({ x: 50, y: 50, w: 10, h: 10 });
  model.alphaKey = BLACK;
  model.colorTolerance = 100; // widest possible tolerance

  await model.pasteIntoSelection(await create_solid_png_buffer(10, 10, { r: 50, g: 50, b: 50 })); // close to black, not exact

  const data = model.selection.original.data();
  expect(data[3]).toBe(0); // stripped to transparent
});

test('pasteIntoSelection with colorTolerance 0 keeps today\'s exact-match-only behavior', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = new Selection({ x: 50, y: 50, w: 10, h: 10 });
  model.alphaKey = BLACK;
  model.colorTolerance = 0;

  await model.pasteIntoSelection(await create_solid_png_buffer(10, 10, { r: 50, g: 50, b: 50 })); // close to black, not exact

  expect(model.selection.original.pixel_color(0, 0)).toStrictEqual({ r: 50, g: 50, b: 50 }); // not stripped
  const data = model.selection.original.data();
  expect(data[3]).toBe(255); // still opaque
});

test('toleranceToDistance maps the 0-100 slider onto the max RGB distance', () => {
  expect(toleranceToDistance(0)).toBe(0);
  expect(toleranceToDistance(100)).toBeCloseTo(Math.sqrt(3 * 255 * 255));
});

test('manipulateSelection is a no-op on an empty model', async () => {
  const model = new ImageModel();
  model.selection = new Selection({ x: 0, y: 0, w: 100, h: 100 });

  await model.manipulateSelection('flipH');

  expect(model.isEmpty()).toBeTruthy();
});

test('manipulateSelection is a no-op without an active selection', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK));

  await model.manipulateSelection('flipH');

  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(BLACK);
});

test('manipulateSelection flipH flips the selected region in place', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(300, 200, WHITE, BLACK)); // black top-left corner
  model.selection = new Selection({ x: 0, y: 0, w: 300, h: 200 });

  await model.manipulateSelection('flipH');

  expect(model.mainImage.width).toBe(300);
  expect(model.mainImage.height).toBe(200);
  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE);
  expect(model.mainImage.pixel_color(299, 0)).toStrictEqual(BLACK);
});

test('manipulateSelection flipH on an ellipse selection only affects pixels inside the ellipse', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  // left half black, right half white
  model.mainImage.composite(await CreateBitmap(await create_solid_png_buffer(50, 100, BLACK)), 0, 0);

  model.selection = new Selection({ type: 'ellipse', x: 0, y: 0, w: 100, h: 100 });
  await model.manipulateSelection('flipH');

  expect(model.mainImage.pixel_color(10, 50)).toStrictEqual(WHITE); // interior pixel, flipped from black to white
  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(BLACK); // corner, outside the ellipse, untouched by the flip
});

test('manipulateSelection rotateCW rotates the selected region and keeps its footprint', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK)); // black top-left corner, square
  model.selection = new Selection({ x: 0, y: 0, w: 100, h: 100 });

  await model.manipulateSelection('rotateCW');

  expect(model.mainImage.width).toBe(100);
  expect(model.mainImage.height).toBe(100);
  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE);
  expect(model.mainImage.pixel_color(99, 0)).toStrictEqual(BLACK);
});

test('manipulateSelection rotateCW resizes a non-square selection back to its original footprint', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 100, WHITE));
  // left half black, right half white
  model.mainImage.composite(await CreateBitmap(await create_solid_png_buffer(100, 100, BLACK)), 0, 0);

  model.selection = new Selection({ x: 0, y: 0, w: 200, h: 100 }); // non-square: the whole canvas
  await model.manipulateSelection('rotateCW');

  expect(model.mainImage.width).toBe(200);
  expect(model.mainImage.height).toBe(100);
  // a left/right split rotates 90deg CW into a top/bottom split
  expect(model.mainImage.pixel_color(50, 10)).toStrictEqual(BLACK);
  expect(model.mainImage.pixel_color(50, 90)).toStrictEqual(WHITE);
});

test('manipulateSelection returns to marquee (no original) after baking a one-shot transform', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK));
  model.selection = new Selection({ x: 0, y: 0, w: 100, h: 100 });

  await model.manipulateSelection('rotateCW');

  expect(model.hasFloatingLayer()).toBe(false);
  expect(model.selection.original).toBeNull();
});

test('manipulateSelection updates the floating selection transform instead of mainImage when floating', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 40, h: 40 });
  await model.pasteIntoSelection(await create_solid_png_buffer(40, 40, BLACK));
  const historyLengthBefore = model.history.length;

  await model.manipulateSelection('rotateCW');
  expect(model.selection.rotation).toBe(90);

  await model.manipulateSelection('rotateCCW');
  expect(model.selection.rotation).toBe(0);

  await model.manipulateSelection('flipH');
  expect(model.selection.flipH).toBe(true);

  await model.manipulateSelection('flipV');
  expect(model.selection.flipV).toBe(true);

  // mainImage and history are untouched - nothing is committed yet
  expect(model.mainImage.pixel_color(10, 10)).toStrictEqual(WHITE);
  expect(model.history).toHaveLength(historyLengthBefore);
});

test('manipulateSelection rotating a floating selection 4 times returns to the original preview pixel-for-pixel', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 40, h: 40 });
  await model.pasteIntoSelection(await create_solid_png_buffer(40, 40, BLACK));
  const before = Array.from(model.getFloatingLayerPreview().data());

  for (let i = 0; i < 4; i++) await model.manipulateSelection('rotateCW');

  expect(model.selection.rotation).toBe(0);
  expect(Array.from(model.getFloatingLayerPreview().data())).toStrictEqual(before);
});

test('manipulateSelection flipping a floating selection twice returns to the original preview pixel-for-pixel', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 40, h: 40 });
  await model.pasteIntoSelection(await create_solid_png_buffer(40, 40, BLACK));
  const before = Array.from(model.getFloatingLayerPreview().data());

  await model.manipulateSelection('flipH');
  await model.manipulateSelection('flipH');

  expect(model.selection.flipH).toBe(false);
  expect(Array.from(model.getFloatingLayerPreview().data())).toStrictEqual(before);
});

test('commitFloatingLayer is a no-op when there is no floating layer', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  const historyLengthBefore = model.history.length;

  await model.commitFloatingLayer();

  expect(model.history).toHaveLength(historyLengthBefore);
});

test('commitFloatingLayer bakes the transformed floating selection into mainImage, records one history entry, and returns to marquee', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = new Selection({ type: 'rect', x: 50, y: 50, w: 100, h: 100 });
  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));
  const historyLengthBefore = model.history.length;

  await model.commitFloatingLayer();

  expect(model.hasFloatingLayer()).toBe(false);
  expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(BLACK);
  expect(model.mainImage.pixel_color(149, 149)).toStrictEqual(BLACK);
  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE);
  expect(model.history).toHaveLength(historyLengthBefore + 1);
});

test('commitFloatingLayer applies the ellipse mask before compositing', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = new Selection({ type: 'ellipse', x: 0, y: 0, w: 100, h: 100 });
  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

  await model.commitFloatingLayer();

  expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(BLACK); // center, inside the ellipse
  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE); // corner, outside the ellipse
});

test('commitFloatingLayer leaves the selection at its final (possibly moved/resized) bounds', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = new Selection({ type: 'rect', x: 50, y: 50, w: 100, h: 100 });
  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));
  model.selection.x = 10;
  model.selection.y = 10;
  model.selection.w = 30;
  model.selection.h = 30;

  await model.commitFloatingLayer();

  expect(model.selection.bounds()).toStrictEqual({ x: 10, y: 10, w: 30, h: 30 });
  expect(model.selection.type).toBe('rect');
  expect(model.hasFloatingLayer()).toBe(false);
});

test('commitFloatingLayer bakes rotate/flip transforms applied while floating', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 50, h: 100 });
  await model.pasteIntoSelection(await create_solid_png_buffer(50, 100, BLACK, { r: 0, g: 255, b: 0 })); // green top-left corner
  await model.manipulateSelection('flipH'); // floating -> non-destructive

  await model.commitFloatingLayer();

  // the green corner started top-left of the pasted patch; flipped horizontally, it's now top-right
  expect(model.mainImage.pixel_color(49, 0)).toStrictEqual({ r: 0, g: 255, b: 0 });
});

test('undo after a commit removes the composited content and restores the prior canvas state', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = new Selection({ type: 'rect', x: 50, y: 50, w: 100, h: 100 });
  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));
  await model.commitFloatingLayer();
  expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(BLACK);

  model.undo();

  expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(WHITE);
});

test('cancelFloatingLayer restores the pre-paste selection without touching mainImage or history', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = new Selection({ type: 'rect', x: 50, y: 50, w: 100, h: 100 });
  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));
  const historyBefore = [...model.history];

  model.cancelFloatingLayer();

  expect(model.hasFloatingLayer()).toBe(false);
  expect(model.selection.bounds()).toStrictEqual({ x: 50, y: 50, w: 100, h: 100 });
  expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(WHITE);
  expect(model.history).toStrictEqual(historyBefore);
});

test('cancelFloatingLayer is a no-op without a floating layer', () => {
  const model = new ImageModel();
  const cancelSpy = () => model.cancelFloatingLayer();

  expect(cancelSpy).not.toThrow();
  expect(model.selection).toBeNull();
});

test('getFloatingLayerPreview returns null when there is no floating layer', () => {
  const model = new ImageModel();
  expect(model.getFloatingLayerPreview()).toBeNull();
});

test('getFloatingLayerPreview resizes to the current w/h without mutating the original bitmap', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 50, h: 50 });
  await model.pasteIntoSelection(await create_solid_png_buffer(50, 50, BLACK));
  model.selection.w = 20;
  model.selection.h = 10;

  const preview = model.getFloatingLayerPreview();

  expect(preview.width).toBe(20);
  expect(preview.height).toBe(10);
  expect(model.selection.original.width).toBe(50); // untouched
  expect(model.selection.original.height).toBe(50);
});

test('getFloatingLayerPreview masks to an ellipse when the selection shape is ellipse', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = new Selection({ type: 'ellipse', x: 0, y: 0, w: 100, h: 100 });
  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

  const preview = model.getFloatingLayerPreview();
  const data = preview.data();

  expect(data[3]).toBe(0); // corner (0,0), outside the ellipse
  const centerIdx = (50 * 100 + 50) * 4;
  expect(data[centerIdx + 3]).toBe(255); // center, inside the ellipse
});

test('getFloatingLayerPreview repeated calls with the same rotation produce identical results (no cumulative loss)', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = new Selection({ type: 'rect', x: 0, y: 0, w: 40, h: 40 });
  await model.pasteIntoSelection(await create_solid_png_buffer(40, 40, BLACK));
  model.selection.rotation = 90;

  const first = model.getFloatingLayerPreview();
  const second = model.getFloatingLayerPreview();

  expect(Array.from(first.data())).toStrictEqual(Array.from(second.data()));
});

test('updateCopyBlob is a no-op on an empty model', async () => {
  const model = new ImageModel();
  model.selection = new Selection({ x: 0, y: 0, w: 100, h: 100 });

  await model.updateCopyBlob();

  expect(model.pendingCopyBlob).toBeNull();
});

test('updateCopyBlob is a no-op without an active selection', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));

  await model.updateCopyBlob();

  expect(model.pendingCopyBlob).toBeNull();
});

test('updateCopyBlob captures the selection as a PNG blob', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = new Selection({ x: 0, y: 0, w: 50, h: 50 });

  await model.updateCopyBlob();

  expect(model.pendingCopyBlob).toBeInstanceOf(Blob);
  expect(model.pendingCopyBlob.type).toBe('image/png');
  expect(model.pendingCopyBlob.size).toBeGreaterThan(0);
});

test('updateCopyBlob on an ellipse selection makes bounding-box corners transparent', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = new Selection({ type: 'ellipse', x: 0, y: 0, w: 100, h: 100 });

  await model.updateCopyBlob();

  const buffer = await model.pendingCopyBlob.arrayBuffer();
  const decoded = await CreateBitmap(buffer);
  const data = decoded.data();
  expect(data[3]).toBe(0); // corner (0,0), outside the ellipse
  const centerIdx = (50 * 100 + 50) * 4;
  expect(data[centerIdx + 3]).toBe(255); // center (50,50), inside the ellipse, opaque
});
