import { expect, test } from 'vitest'
import ImageModel from '../image_model.js'
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
  model.selection = { x: 0, y: 0, w: 5, h: 5 };

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
  model.selection = { x: 0, y: 0, w: 100, h: 100 };

  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

  expect(model.isEmpty()).toBeTruthy();
  expect(model.pendingCopyBlob).toBeNull();
});

test('pasteIntoSelection is a no-op without an active selection', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));

  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE);
  expect(model.pendingCopyBlob).toBeNull();
});

test('pasteIntoSelection composites the pasted image into the selection only', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = { x: 50, y: 50, w: 100, h: 100 };

  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

  expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(BLACK);
  expect(model.mainImage.pixel_color(149, 149)).toStrictEqual(BLACK);
  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE);
  expect(model.mainImage.pixel_color(150, 150)).toStrictEqual(WHITE);
});

test('pasteIntoSelection with an ellipse selection only overwrites pixels inside the ellipse', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = { type: 'ellipse', x: 0, y: 0, w: 100, h: 100 };

  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK));

  expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(BLACK); // center, inside the ellipse
  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE); // corner, outside the ellipse, untouched
});

test('pasteIntoSelection strips pixels matching the alpha key instead of pasting them', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 200, WHITE));
  model.selection = { x: 50, y: 50, w: 100, h: 100 };
  model.alphaKey = BLACK;

  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK)); // matches alpha key

  // the whole pasted patch matched the alpha key, so nothing shows through
  expect(model.mainImage.pixel_color(50, 50)).toStrictEqual(WHITE);
  expect(model.mainImage.pixel_color(149, 149)).toStrictEqual(WHITE);
});

test('manipulateSelection is a no-op on an empty model', async () => {
  const model = new ImageModel();
  model.selection = { x: 0, y: 0, w: 100, h: 100 };

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
  model.selection = { x: 0, y: 0, w: 300, h: 200 };

  await model.manipulateSelection('flipH');

  expect(model.mainImage.width).toBe(300);
  expect(model.mainImage.height).toBe(200);
  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE);
  expect(model.mainImage.pixel_color(299, 0)).toStrictEqual(BLACK);
});

test('manipulateSelection flipH on an ellipse selection only affects pixels inside the ellipse', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = { type: 'rect', x: 0, y: 0, w: 50, h: 100 };
  await model.pasteIntoSelection(await create_solid_png_buffer(50, 100, BLACK)); // left half black, right half white

  model.selection = { type: 'ellipse', x: 0, y: 0, w: 100, h: 100 };
  await model.manipulateSelection('flipH');

  expect(model.mainImage.pixel_color(10, 50)).toStrictEqual(WHITE); // interior pixel, flipped from black to white
  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(BLACK); // corner, outside the ellipse, untouched by the flip
});

test('manipulateSelection rotateCW rotates the selected region and keeps its footprint', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE, BLACK)); // black top-left corner, square
  model.selection = { x: 0, y: 0, w: 100, h: 100 };

  await model.manipulateSelection('rotateCW');

  expect(model.mainImage.width).toBe(100);
  expect(model.mainImage.height).toBe(100);
  expect(model.mainImage.pixel_color(0, 0)).toStrictEqual(WHITE);
  expect(model.mainImage.pixel_color(99, 0)).toStrictEqual(BLACK);
});

test('manipulateSelection rotateCW resizes a non-square selection back to its original footprint', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(200, 100, WHITE));
  model.selection = { x: 0, y: 0, w: 100, h: 100 };
  await model.pasteIntoSelection(await create_solid_png_buffer(100, 100, BLACK)); // left half black, right half white

  model.selection = { x: 0, y: 0, w: 200, h: 100 }; // non-square: the whole canvas
  await model.manipulateSelection('rotateCW');

  expect(model.mainImage.width).toBe(200);
  expect(model.mainImage.height).toBe(100);
  // a left/right split rotates 90deg CW into a top/bottom split
  expect(model.mainImage.pixel_color(50, 10)).toStrictEqual(BLACK);
  expect(model.mainImage.pixel_color(50, 90)).toStrictEqual(WHITE);
});

test('updateCopyBlob is a no-op on an empty model', async () => {
  const model = new ImageModel();
  model.selection = { x: 0, y: 0, w: 100, h: 100 };

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
  model.selection = { x: 0, y: 0, w: 50, h: 50 };

  await model.updateCopyBlob();

  expect(model.pendingCopyBlob).toBeInstanceOf(Blob);
  expect(model.pendingCopyBlob.type).toBe('image/png');
  expect(model.pendingCopyBlob.size).toBeGreaterThan(0);
});

test('updateCopyBlob on an ellipse selection makes bounding-box corners transparent', async () => {
  const model = new ImageModel();
  await model.createNew(await create_solid_png_buffer(100, 100, WHITE));
  model.selection = { type: 'ellipse', x: 0, y: 0, w: 100, h: 100 };

  await model.updateCopyBlob();

  const buffer = await model.pendingCopyBlob.arrayBuffer();
  const decoded = await CreateBitmap(buffer);
  const data = decoded.data();
  expect(data[3]).toBe(0); // corner (0,0), outside the ellipse
  const centerIdx = (50 * 100 + 50) * 4;
  expect(data[centerIdx + 3]).toBe(255); // center (50,50), inside the ellipse, opaque
});
