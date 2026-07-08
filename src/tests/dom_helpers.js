import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

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
