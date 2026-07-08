import { vi } from 'vitest'

// Runs for every test file, including plain-node ones - must not touch document/window.

global.ClipboardItem = class ClipboardItem {
  constructor(items) {
    this.items = items;
  }
};

global.navigator.clipboard = { write: vi.fn() };
