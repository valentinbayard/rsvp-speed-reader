// End-to-end check of the web reader in headless Chromium.
// Usage: node tests/e2e.mjs [outDir]   (serves ./web on a random port)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve('web');
const outDir = process.argv[2] ?? 'test-results';
fs.mkdirSync(outDir, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!file.startsWith(root) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'fr-FR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const state = () => page.evaluate(() => document.querySelector('#reader-host').shadowRoot?.querySelector('.root')?.dataset.state);
const word = () => page.evaluate(() => document.querySelector('#reader-host').shadowRoot.querySelector('.word').textContent);

await page.goto(url);
await page.fill('#input', fs.readFileSync('tests/sample-fr.txt', 'utf8'));
await shot('01-home');
await page.click('#read');
await page.waitForFunction(() => document.querySelector('#reader-host').shadowRoot?.querySelector('.root')?.dataset.state === 'playing', null, { timeout: 5000 });
await page.waitForTimeout(1200);
await shot('02-playing');
const w1 = await word();
await page.waitForTimeout(500);
assert.notEqual(await word(), w1, 'words advance');

// Tap to pause → context view.
await page.mouse.click(200, 300);
await page.waitForTimeout(400);
assert.equal(await state(), 'paused');
await shot('03-paused');

// The cursor must sit on the reading line.
const geo = await page.evaluate(() => {
  const sr = document.querySelector('#reader-host').shadowRoot;
  const c = sr.querySelector('.cursor').getBoundingClientRect();
  const b = sr.querySelector('.band').getBoundingClientRect();
  return { cursorY: c.top + c.height / 2, bandY: b.top + b.height / 2 };
});
assert.ok(Math.abs(geo.cursorY - geo.bandY) < 20, `cursor on reading line ${JSON.stringify(geo)}`);

// Tap a word in the text: the cursor moves there; tapping it again resumes from it.
const locate = () =>
  page.evaluate(() => {
    const sr = document.querySelector('#reader-host').shadowRoot;
    const p = [...sr.querySelectorAll('.article p')].find((p) => p.textContent.includes('RSVP'));
    const node = p.firstChild;
    const i = node.data.indexOf('RSVP');
    const r = document.createRange();
    r.setStart(node, i);
    r.setEnd(node, i + 4);
    const rect = r.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
// Scroll the text by hand (like a finger would) until the word is mid-screen.
let target = await locate();
await page.evaluate((dy) => (document.querySelector('#reader-host').shadowRoot.querySelector('.context').scrollTop += dy), target.y - 400);
await page.waitForTimeout(200);
target = await locate();
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(300);
await shot('04-word-selected');
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(150);
assert.equal(await state(), 'playing');
assert.match(await word(), /RSVP/, 'resumes from the tapped word');

// Keyboard: space pauses, arrows move by sentence.
await page.keyboard.press(' ');
await page.waitForTimeout(250);
assert.equal(await state(), 'paused');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(250);
await shot('05-next-sentence');

// Settings sheet, dark theme.
await page.evaluate(() => document.querySelector('#reader-host').shadowRoot.querySelector('[data-act=settings]').click());
await page.waitForTimeout(350);
await shot('06-settings');
await page.evaluate(() => [...document.querySelector('#reader-host').shadowRoot.querySelectorAll('.seg[data-key=theme] button')][1].click());
await page.evaluate(() => document.querySelector('#reader-host').shadowRoot.querySelector('.scrim').click());
await page.waitForTimeout(300);
await shot('07-dark-paused');
await page.keyboard.press(' ');
await page.waitForTimeout(800);
await shot('08-dark-playing');

// Speed to max and let it finish.
await page.evaluate(() => [...document.querySelector('#reader-host').shadowRoot.querySelectorAll('.seg[data-key=theme] button')][0]?.click());
for (let k = 0; k < 40; k++) await page.keyboard.press('ArrowUp');
await page.waitForFunction(() => document.querySelector('#reader-host').shadowRoot.querySelector('.root').dataset.state === 'ended', null, { timeout: 60000 });
await page.waitForTimeout(500);
await shot('09-recap');

// Close and come back: the library remembers it.
await page.evaluate(() => document.querySelector('#reader-host').shadowRoot.querySelector('.recap [data-act=close]').click());
await page.waitForTimeout(300);
assert.equal(await page.isVisible('#library-section'), true);
await shot('10-home-library');

await browser.close();
server.close();
assert.deepEqual(errors, [], 'no console errors');
console.log('e2e ok →', outDir);
