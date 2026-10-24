// Cloudflare Worker: fetches a public article and returns its text.
// Used only by the web version (the Android app and the extension read pages
// themselves, with your logins). Deploy: `npx wrangler deploy` in this folder.
//
// GET /api/extract?url=… → { title, source, paragraphs, content }
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre';
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|\[?f[cd])/i;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const { pathname, searchParams } = new URL(request.url);
    if (pathname === '/health') return json({ status: 'ok' });
    if (pathname !== '/api/extract') return json({ error: 'Not found' }, 404);

    let target;
    try {
      target = new URL(searchParams.get('url') ?? '');
    } catch {
      return json({ error: 'Invalid URL' }, 400);
    }
    if (!/^https?:$/.test(target.protocol) || PRIVATE_HOST.test(target.hostname)) return json({ error: 'URL not allowed' }, 400);

    let res;
    try {
      res = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
          'Accept-Language': 'fr,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        cf: { cacheTtl: 300 },
      });
    } catch (e) {
      return json({ error: `Fetch failed: ${e.message}` }, 502);
    }
    if (!res.ok) return json({ error: `Upstream ${res.status}` }, 502);
    if (!/html/.test(res.headers.get('content-type') ?? '')) return json({ error: 'Not an HTML page' }, 415);

    const { document } = parseHTML(await res.text());
    const article = new Readability(document).parse();
    if (!article?.content) return json({ error: 'No article found' }, 422);

    const { document: frag } = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`);
    const paragraphs = [];
    for (const el of frag.querySelectorAll(BLOCKS)) {
      if (el.querySelector(BLOCKS) || el.closest('figcaption, aside, nav')) continue;
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (text && paragraphs[paragraphs.length - 1] !== text) paragraphs.push(text);
    }
    return json({
      title: article.title,
      source: target.hostname.replace(/^www\./, ''),
      paragraphs,
      content: paragraphs.join('\n\n'),
    });
  },
};
