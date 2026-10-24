// Renders web/icons/icon.svg to the PNG sizes the PWA and the extension need.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const svg = fs.readFileSync('web/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const render = async (size, file, { maskable = false, rounded = true } = {}) => {
  let s = svg;
  if (!rounded) s = s.replace(/rx="24"/, 'rx="0"');
  // Maskable icons need the motif inside the central 80% safe zone.
  const inner = maskable ? `<g transform="translate(10.8 10.8) scale(0.8)">${s.replace(/<\/?svg[^>]*>/g, '')}</g>` : null;
  const body = maskable ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" fill="#f2eee3"/>${inner}</svg>` : s;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${body.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true });
};
await render(192, 'web/icons/icon-192.png');
await render(512, 'web/icons/icon-512.png');
await render(512, 'web/icons/maskable-512.png', { maskable: true, rounded: false });
for (const n of [16, 48, 128]) await render(n, `extension/icons/icon${n}.png`);
await browser.close();
console.log('icons written');
