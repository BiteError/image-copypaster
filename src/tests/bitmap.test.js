import { expect, test } from 'vitest'
import { CreateBitmap } from '../bitmap.js'
import { CreateEmptyBitmap } from '../bitmap.js'
import { create_test_bitmap, create_solid_bitmap, create_solid_png_buffer } from './test_helpers.js'

test('Returns a proper height and width for empty bitmap', () => {
  const bitmap = CreateEmptyBitmap();
  expect(bitmap.width).toBe(300);
  expect(bitmap.height).toBe(150);
  expect(bitmap.isEmpty()).toBeTruthy();
});

test('Returns a proper height and width for bitmap created from an array', async () => {
  const bitmap = await create_test_bitmap();
  expect(bitmap.width).toBe(300);
  expect(bitmap.height).toBe(200);
  expect(bitmap.isEmpty()).toBeFalsy();
  expect(bitmap.pixel_color(0, 0)).toStrictEqual({ r: 0, g: 0, b: 0 });
});

test('Decodes a real image blob into a non-empty bitmap', async () => {
  const buffer = await create_solid_png_buffer(100, 100, { r: 12, g: 34, b: 56 });
  const bitmap = await CreateBitmap(buffer);

  expect(bitmap.width).toBe(100);
  expect(bitmap.height).toBe(100);
  expect(bitmap.isEmpty()).toBeFalsy();
  expect(bitmap.pixel_color(0, 0)).toStrictEqual({ r: 12, g: 34, b: 56 });
});

test('Rotate CW degrees moves pixels and resize image', async () => {
  const bitmap = await create_test_bitmap();
  bitmap.rotate_cw();

  expect(bitmap.width).toBe(200);
  expect(bitmap.height).toBe(300);
  expect(bitmap.pixel_color(0, 0)).toStrictEqual({ r: 255, g: 255, b: 255 });
  expect(bitmap.pixel_color(199, 0)).toStrictEqual({ r: 0, g: 0, b: 0 });
});

test('Rotate CCW degrees moves pixels and resize image', async () => {
  const bitmap = await create_test_bitmap();
  bitmap.rotate_ccw();

  expect(bitmap.width).toBe(200);
  expect(bitmap.height).toBe(300);
  expect(bitmap.pixel_color(0, 0)).toStrictEqual({ r: 255, g: 255, b: 255 });
  expect(bitmap.pixel_color(0, 299)).toStrictEqual({ r: 0, g: 0, b: 0 });
});

test('Resize bitmap blurs out black pixel', async () => {
  const bitmap = await create_test_bitmap();
  bitmap.resize(100, 150);

  expect(bitmap.width).toBe(100);
  expect(bitmap.height).toBe(150);
  expect(bitmap.pixel_color(0, 0)).not.toBe({ r: 0, g: 0, b: 0 });
  expect(bitmap.pixel_color(0, 0)).not.toBe({ r: 255, g: 255, b: 255 });
  expect(bitmap.pixel_color(1, 0)).toStrictEqual({ r: 255, g: 255, b: 255 });
  expect(bitmap.pixel_color(0, 1)).toStrictEqual({ r: 255, g: 255, b: 255 });
});

test('Flip vertically moves pixels and keeps size of image', async () => {
  const bitmap = await create_test_bitmap();
  bitmap.flip_vertical();

  expect(bitmap.width).toBe(300);
  expect(bitmap.height).toBe(200);
  expect(bitmap.pixel_color(0, 0)).toStrictEqual({ r: 255, g: 255, b: 255 });
  expect(bitmap.pixel_color(299, 0)).toStrictEqual({ r: 255, g: 255, b: 255 });
  expect(bitmap.pixel_color(299, 199)).toStrictEqual({ r: 255, g: 255, b: 255 });
  expect(bitmap.pixel_color(0, 199)).toStrictEqual({ r: 0, g: 0, b: 0 });
});

test('Flip horizontally moves pixels and keeps size of image', async () => {
  const bitmap = await create_test_bitmap();
  bitmap.flip_horizontal();

  expect(bitmap.width).toBe(300);
  expect(bitmap.height).toBe(200);
  expect(bitmap.pixel_color(0, 0)).toStrictEqual({ r: 255, g: 255, b: 255 });
  expect(bitmap.pixel_color(299, 0)).toStrictEqual({ r: 0, g: 0, b: 0 });
  expect(bitmap.pixel_color(299, 199)).toStrictEqual({ r: 255, g: 255, b: 255 });
  expect(bitmap.pixel_color(0, 199)).toStrictEqual({ r: 255, g: 255, b: 255 });
});

test('Crop extracts a sub-region and resizes the bitmap to it', async () => {
  const bitmap = await create_test_bitmap();
  bitmap.crop(0, 0, 100, 50);

  expect(bitmap.width).toBe(100);
  expect(bitmap.height).toBe(50);
  expect(bitmap.pixel_color(0, 0)).toStrictEqual({ r: 0, g: 0, b: 0 });
  expect(bitmap.pixel_color(1, 0)).toStrictEqual({ r: 255, g: 255, b: 255 });
});

test('Composite pastes a bitmap onto another at an offset', async () => {
  const base = await create_solid_bitmap(300, 200, { r: 255, g: 255, b: 255 });
  const patch = await create_solid_bitmap(300, 200, { r: 0, g: 0, b: 0 });
  patch.crop(0, 0, 10, 10);

  base.composite(patch, 20, 30);

  expect(base.pixel_color(20, 30)).toStrictEqual({ r: 0, g: 0, b: 0 });
  expect(base.pixel_color(29, 39)).toStrictEqual({ r: 0, g: 0, b: 0 });
  expect(base.pixel_color(30, 40)).toStrictEqual({ r: 255, g: 255, b: 255 });
});

test('Make color transparent zeroes alpha for matching pixels only', async () => {
  const bitmap = await create_test_bitmap(255, 0);
  bitmap.make_color_transparent({ r: 255, g: 255, b: 255 });

  const data = bitmap.data();
  expect(data[3]).toBe(255); // first pixel is black, untouched
  expect(data[4 + 3]).toBe(0); // second pixel is white, made transparent
});

test('getBufferAsync returns a PNG buffer that can be decoded back', async () => {
  const bitmap = await create_test_bitmap();
  const buffer = await bitmap.getBufferAsync();

  const decoded = await CreateBitmap(buffer);
  expect(decoded.width).toBe(bitmap.width);
  expect(decoded.height).toBe(bitmap.height);
  expect(decoded.pixel_color(0, 0)).toStrictEqual({ r: 0, g: 0, b: 0 });
});
