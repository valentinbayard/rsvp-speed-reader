// Runs in the page (isolated world) after Readability.js and extract.js.
(async () => {
  const HOST_ID = 'lecture-rapide-reader';
  if (document.getElementById(HOST_ID)) return; // already open

  const article = window.__rsvpExtract();
  const words = (article.paragraphs ?? []).join(' ').split(/\s+/).filter(Boolean).length;
  if (article.error || words < 3) {
    toast('Pas de texte détecté. Sélectionnez le passage à lire, puis réessayez.');
    return;
  }

  const base = chrome.runtime.getURL('web/');
  const [{ createReader }, { tokenize, hashText, tokenAt }, { findArticle, locate }] = await Promise.all([
    import(base + 'reader/reader.js'),
    import(base + 'core/text.js'),
    import(base + 'core/article.js'),
  ]);
  const { withDefaults } = await import(base + 'core/storage.js');

  let paragraphs = article.paragraphs;
  let headings = article.headings ?? [];
  const found = article.fallback ? findArticle(paragraphs) : null;
  if (found) {
    paragraphs = found.paragraphs;
    headings = [];
  }
  if (article.title && !article.fromSelection && paragraphs[0] !== article.title) {
    paragraphs = [article.title, ...paragraphs];
    headings = [0, ...headings.map((h) => h + 1)];
  }
  const id = hashText(paragraphs.join('\n'));
  const tokens = tokenize(paragraphs);
  const total = tokens.length;
  const stored = await chrome.storage.local.get(['settings', `pos.${id}`]);
  const settings = withDefaults(stored.settings);
  // A word selected on the page: start there.
  const at = article.start ? locate(paragraphs, article.start) : null;
  const startAt = at ? tokenAt(tokens, at.p, at.offset) : null;
  const position = startAt ?? stored[`pos.${id}`] ?? 0;
  const resumed = startAt == null && position > 0 && position < total - 1;

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  const reader = createReader(host, {
    doc: { title: article.title, paragraphs, headings },
    settings,
    position: resumed || startAt != null ? position : 0,
    resumed,
    onSettings: (s) => chrome.storage.local.set({ settings: s }),
    onPosition: (i) => chrome.storage.local.set({ [`pos.${id}`]: i }),
    onClose: close,
  });

  function close() {
    reader.destroy();
    host.remove();
    document.documentElement.style.overflow = previousOverflow;
  }

  function toast(text) {
    const t = document.createElement('div');
    t.textContent = text;
    Object.assign(t.style, {
      position: 'fixed', zIndex: 2147483647, left: '50%', top: '24px', transform: 'translateX(-50%)',
      background: '#171512', color: '#f2eee3', padding: '10px 16px', borderRadius: '999px',
      font: '14px system-ui, sans-serif', boxShadow: '0 6px 24px rgba(0,0,0,.25)',
    });
    document.documentElement.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
})();
