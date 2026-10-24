// Classic (non-module) script: injected into web pages by the Android app and
// the browser extension, after vendor/Readability.js.
//
// __rsvpExtract() → { title, paragraphs, headings, source, words } | { error }
(function () {
  const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, dd, dt';
  const SKIP = /^(Photo|Illustration|Image|Crédit|Credit|©|Lire aussi|À lire aussi|Read more|Advertisement|Publicité)\b/i;

  function clean(s) {
    return s.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '').replace(/\s+/g, ' ').trim();
  }

  /** Paragraphs from an HTML fragment, keeping headings apart. */
  function blocksFrom(root) {
    const paragraphs = [];
    const headings = [];
    const blocks = root.querySelectorAll(BLOCKS);
    const seen = new Set();
    for (const el of blocks) {
      // Only the innermost blocks, so text is not repeated.
      if (el.querySelector(BLOCKS)) continue;
      if (el.closest('figcaption, aside, nav')) continue;
      const text = clean(el.textContent || '');
      if (!text || seen.has(text) || SKIP.test(text)) continue;
      seen.add(text);
      if (/^H[1-6]$/.test(el.tagName)) headings.push(paragraphs.length);
      paragraphs.push(text);
    }
    if (!paragraphs.length) {
      const text = clean(root.textContent || '');
      if (text) paragraphs.push(text);
    }
    return { paragraphs, headings };
  }

  function selectionText() {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed) return null;
    const text = String(sel).trim();
    if (text.split(/\s+/).length < 3) return null;
    const paragraphs = text.split(/\n\s*\n|\n/).map(clean).filter(Boolean);
    return { paragraphs, headings: [] };
  }

  window.__rsvpExtract = function (options) {
    const useSelection = !options || options.selection !== false;
    const source = location.hostname.replace(/^www\./, '');
    try {
      const sel = useSelection && selectionText();
      if (sel) return { title: document.title, source, ...sel, fromSelection: true };

      let title = document.title;
      let blocks = null;
      if (typeof Readability === 'function') {
        const article = new Readability(document.cloneNode(true), { charThreshold: 300 }).parse();
        if (article && article.content) {
          const div = document.createElement('div');
          div.innerHTML = article.content;
          blocks = blocksFrom(div);
          title = article.title || title;
        }
      }
      if (!blocks || !blocks.paragraphs.length) blocks = blocksFrom(document.body);
      // Readability often keeps the title as the first heading.
      if (blocks.paragraphs[0] === clean(title)) {
        blocks.paragraphs.shift();
        blocks.headings = blocks.headings.filter((h) => h > 0).map((h) => h - 1);
      }
      const words = blocks.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
      return { title: clean(title), source, paragraphs: blocks.paragraphs, headings: blocks.headings, words };
    } catch (e) {
      return { error: String(e && e.message ? e.message : e) };
    }
  };
})();
