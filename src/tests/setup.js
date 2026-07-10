import { vi } from 'vitest'

// Runs for every test file, including plain-node ones - must not touch document/window.

global.ClipboardItem = class ClipboardItem {
  constructor(items) {
    this.items = items;
  }
};

global.navigator.clipboard = { write: vi.fn(), read: vi.fn() };
global.navigator.share = vi.fn();

// jsdom has no real canvas backend, so it doesn't implement ImageData either
// (contrary to the controller-view-tests PRD's assumption of "a real jsdom
// ImageData global") - stub the same constructor shape ImageView.toImageData relies on.
global.ImageData = class ImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
};
