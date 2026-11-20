// Classic (non-module) script: injected into web pages by the Android app and
// the browser extension, after vendor/Readability.js.
//
// __rsvpExtract() → { title, paragraphs, headings, source, words, start?, fromSelection?, fallback? } | { error }
//
// A selection of a few words or more is read on its own. A shorter one (a word
// the user picked) marks where to start in the whole article: `start`.
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

  /** The selected word, with the text around it in its paragraph to tell repeats apart. */
  function selectionStart() {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = clean(String(sel));
    if (!text) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const block = (node && node.closest(BLOCKS)) || node;
    if (!block) return { text };
    const around = (from, fromOffset, to, toOffset) => {
      const r = document.createRange();
      r.setStart(from, fromOffset);
      r.setEnd(to, toOffset);
      return r.toString().replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '').replace(/\s+/g, ' ');
    };
    try {
      return {
        text,
        before: around(block, 0, range.startContainer, range.startOffset).slice(-80),
        after: around(range.endContainer, range.endOffset, block, block.childNodes.length).slice(0, 80),
      };
    } catch (e) {
      return { text };
    }
  }

  window.__rsvpExtract = function (options) {
    const useSelection = !options || options.selection !== false;
    const source = location.hostname.replace(/^www\./, '');
    try {
      const sel = useSelection && selectionText();
      if (sel) return { title: document.title, source, ...sel, fromSelection: true };
      const start = useSelection ? selectionStart() : null;

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
      let fallback = false;
      if (!blocks || !blocks.paragraphs.length) {
        blocks = blocksFrom(document.body);
        fallback = true; // the whole page: menus and footer included
      }
      // Readability often keeps the title as the first heading.
      if (blocks.paragraphs[0] === clean(title)) {
        blocks.paragraphs.shift();
        blocks.headings = blocks.headings.filter((h) => h > 0).map((h) => h - 1);
      }
      const words = blocks.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
      return { title: clean(title), source, paragraphs: blocks.paragraphs, headings: blocks.headings, words, start, fallback };
    } catch (e) {
      return { error: String(e && e.message ? e.message : e) };
    }
  };
})();
