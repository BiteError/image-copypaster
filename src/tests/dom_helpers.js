import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { vi } from 'vitest'

const INDEX_HTML_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../index.html'
);

// Mounts the real index.html's body markup, so the fixture never drifts from
// production markup. Called explicitly by jsdom test files, not via setupFiles.
export function mountFixture() {
  const html = readFileSync(INDEX_HTML_PATH, 'utf-8');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  document.body.innerHTML = body;
}

// jsdom's getContext('2d') returns null with no canvas backend installed. ImageView
// never reads pixel data back out of the context, so a hand-rolled stub of the few
// methods it calls is enough - no need for a real canvas backend dependency.
function stubCanvasContext() {
  return {
    putImageData: vi.fn(),
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: null,
    fillStyle: null,
    lineWidth: null,
  };
}

// Mounts the fixture and wires stub 2D contexts onto image-canvas/ui-layer's
// getContext('2d'), for tests that construct a real ImageView. Returns the stubs
// so tests can assert on drawing calls.
export function mountFixtureWithCanvasStub() {
  mountFixture();
  const imgCtx = stubCanvasContext();
  const uiCtx = stubCanvasContext();
  document.getElementById('image-canvas').getContext = () => imgCtx;
  document.getElementById('ui-layer').getContext = () => uiCtx;
  return { imgCtx, uiCtx };
}
