import { expect, test } from 'vitest'
import Bitmap from '../bitmap.js'
import { CreateBitmap } from '../bitmap.js'
import { CreateBitmapFromArray } from '../bitmap.js'
import { CreateEmptyBitmap } from '../bitmap.js'

// Use 255 for white color and full opacity or 0 for black and transparent
async function create_test_bitmap(color_intensity = 255, first_pixel = 0) {
  const width = 300;
  const height = 200;
  const buffer = new ArrayBuffer(width * height * 4);
  const pixels = new Uint8Array(buffer);

  // 2. Set all pixels to default color and opacity
  pixels.fill(color_intensity);
  pixels[0] = first_pixel;
  pixels[0 + 1] = first_pixel;
  pixels[0 + 2] = first_pixel;

  return await CreateBitmapFromArray(pixels, width, height);
}

test('Returns a proper height and width for empty bitmap', () => {
  const bitmap = CreateEmptyBitmap();
	expect(bitmap.width).toBe(300);
	expect(bitmap.height).toBe(150);
  expect(bitmap.isEmpty()).toBeTruthy();
});

test('Returns a proper height and width for empty bitmap', async () => {
  const bitmap = await create_test_bitmap();
	expect(bitmap.width).toBe(300);
	expect(bitmap.height).toBe(200);
  expect(bitmap.isEmpty()).toBeFalsy();
  expect(bitmap.pixel_color(0, 0)).toStrictEqual({ r: 0, g: 0, b: 0 });
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

