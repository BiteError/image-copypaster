import { CreateBitmapFromArray } from '../bitmap.js'
import { Jimp } from 'jimp'

// Jimp 1.6.0 (pinned, see docs/adr/0001-pin-jimp-version.md) corrupts the pixel buffer
// when width * height < 8192 - keep test bitmaps at or above that pixel count.

function build_pixel_array(width, height, color_intensity, first_pixel) {
  const buffer = new ArrayBuffer(width * height * 4);
  const pixels = new Uint8Array(buffer);
  pixels.fill(color_intensity);
  pixels[0] = first_pixel;
  pixels[1] = first_pixel;
  pixels[2] = first_pixel;
  return pixels;
}

function fill_rgba(width, height, color, corner_color) {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = color.r;
    pixels[i + 1] = color.g;
    pixels[i + 2] = color.b;
    pixels[i + 3] = color.a ?? 255;
  }
  if (corner_color) {
    pixels[0] = corner_color.r;
    pixels[1] = corner_color.g;
    pixels[2] = corner_color.b;
    pixels[3] = corner_color.a ?? 255;
  }
  return pixels;
}

// Use 255 for white color and full opacity or 0 for black and transparent.
// Kept for the pre-existing pixel-only Bitmap tests, which never inspect alpha.
export async function create_test_bitmap(color_intensity = 255, first_pixel = 0) {
  const width = 300;
  const height = 200;
  const pixels = build_pixel_array(width, height, color_intensity, first_pixel);
  return await CreateBitmapFromArray(pixels, width, height);
}

// Full independent RGBA control (defaults to opaque), for tests where alpha itself matters,
// e.g. compositing one bitmap onto another.
export async function create_solid_bitmap(width, height, color = { r: 255, g: 255, b: 255, a: 255 }, corner_color = null) {
  const pixels = fill_rgba(width, height, color, corner_color);
  return await CreateBitmapFromArray(pixels, width, height);
}

// Same as create_solid_bitmap, but encoded as a real PNG buffer - for exercising the
// Jimp.read/blob-decode path (CreateBitmap, ImageModel.createNew/pasteIntoSelection).
// Always opaque by default so RGB values survive the PNG round-trip.
export async function create_solid_png_buffer(width, height, color = { r: 255, g: 255, b: 255, a: 255 }, corner_color = null) {
  const pixels = fill_rgba(width, height, color, corner_color);
  const jimpImage = await Jimp.fromBitmap({ data: Buffer.from(pixels), width, height });
  return await jimpImage.getBuffer('image/png');
}
