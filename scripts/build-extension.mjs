// Copies the shared web reader into extension/web so the extension folder can
// be loaded unpacked (chrome://extensions → "Load unpacked") or zipped.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dest = path.join(root, 'extension', 'web');
fs.rmSync(dest, { recursive: true, force: true });
for (const dir of ['core', 'reader', 'fonts', 'vendor']) {
  fs.cpSync(path.join(root, 'web', dir), path.join(dest, dir), { recursive: true });
}
console.log('extension/web updated');
