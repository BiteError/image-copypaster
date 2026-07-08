import { JimpBitmap } from '../bitmap.js'
import { Jimp } from 'jimp'

function to_hex_color({ r, g, b, a = 255 }) {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

function build_jimp_image(width, height, color, corner_color) {
  const jimpImage = new Jimp({ width, height, color: to_hex_color(color) });
  if (corner_color) {
    const { r, g, b, a = 255 } = corner_color;
    const data = jimpImage.bitmap.data;
    data[0] = r;
    data[1] = g;
    data[2] = b;
    data[3] = a;
  }
  return jimpImage;
}

// Use 255 for white color and full opacity or 0 for black and transparent.
// Kept for the pre-existing pixel-only Bitmap tests, which never inspect alpha.
export async function create_test_bitmap(color_intensity = 255, first_pixel = 0) {
  const width = 300;
  const height = 200;
  const jimpImage = build_jimp_image(
    width, height,
    { r: color_intensity, g: color_intensity, b: color_intensity, a: color_intensity },
    { r: first_pixel, g: first_pixel, b: first_pixel, a: color_intensity }
  );
  return new JimpBitmap(jimpImage);
}

// Full independent RGBA control (defaults to opaque), for tests where alpha itself matters,
// e.g. compositing one bitmap onto another.
export async function create_solid_bitmap(width, height, color = { r: 255, g: 255, b: 255, a: 255 }, corner_color = null) {
  const jimpImage = build_jimp_image(width, height, color, corner_color);
  return new JimpBitmap(jimpImage);
}

// Same as create_solid_bitmap, but encoded as a real PNG buffer - for exercising the
// Jimp.read/blob-decode path (CreateBitmap, ImageModel.createNew/pasteIntoSelection).
// Always opaque by default so RGB values survive the PNG round-trip.
export async function create_solid_png_buffer(width, height, color = { r: 255, g: 255, b: 255, a: 255 }, corner_color = null) {
  const jimpImage = build_jimp_image(width, height, color, corner_color);
  return await jimpImage.getBuffer('image/png');
}
