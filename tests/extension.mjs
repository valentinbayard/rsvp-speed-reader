// Loads the unpacked extension in Chromium and reads a page with a strict CSP.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)('playwright');
const outDir = process.argv[2] ?? 'test-results';
fs.mkdirSync(outDir, { recursive: true });
const html = fs.readFileSync('tests/fixtures-article.html');
const server = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html));
await new Promise((r) => server.listen(0, r));

// activeTab needs a real click on the toolbar button; for the test, grant the host instead.
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'rsvp-ext-'));
fs.cpSync(path.resolve('extension'), ext, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'rsvp-')), {
  headless: true,
  channel: 'chromium',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1100, height: 760 },
});
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/article`);
let [worker] = ctx.serviceWorkers();
worker ??= await ctx.waitForEvent('serviceworker');
await worker.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['web/vendor/Readability.js', 'web/core/extract.js', 'content.js'] });
});
const sr = () => page.evaluateHandle(() => document.getElementById('lecture-rapide-reader')?.shadowRoot);
await page.waitForFunction(() => document.getElementById('lecture-rapide-reader')?.shadowRoot?.querySelector('.root')?.dataset.state === 'playing', null, { timeout: 8000 });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(outDir, 'ext-playing.png') });
await page.keyboard.press(' ');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, 'ext-paused.png') });
const paras = await page.evaluate(() => [...document.getElementById('lecture-rapide-reader').shadowRoot.querySelectorAll('.article p, .article h2')].map((p) => p.textContent));
console.log(paras.map((p) => p.slice(0, 60)));
assert.equal(paras[0], "La lecture rapide n'est pas une course");
assert.ok(paras.some((p) => p.startsWith('Depuis quelques années, les méthodes de lecture rapide fleurissent')), 'inline link kept in paragraph');
assert.ok(!paras.some((p) => /Accueil|Lire aussi|Photo/.test(p)), 'no page chrome');
const fontOk = await page.evaluate(() => document.fonts.check("48px 'Literata RSVP'"));
console.log('font loaded:', fontOk);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
assert.equal(await page.evaluate(() => !!document.getElementById('lecture-rapide-reader')), false, 'Escape closes');
await ctx.close();
server.close();
assert.deepEqual(errors, []);
console.log('extension ok');
