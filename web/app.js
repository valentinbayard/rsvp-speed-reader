import { createReader, addFonts } from './reader/reader.js';
import { toParagraphs, tokenize, hashText } from './core/text.js';
import * as store from './core/storage.js';

// Optional URL extraction service for the web version (see /worker).
const EXTRACT_ENDPOINT = 'https://rsvp-reader-proxy.valentin-bayard.workers.dev/api/extract';

/** Bridge injected by the Android app (see android/.../WebBridge.kt). */
const native = globalThis.RSVPNative ?? null;

const $ = (s) => document.querySelector(s);
const home = $('#home');
const input = $('#input');
const readBtn = $('#read');
const inputInfo = $('#input-info');
const inputError = $('#input-error');
const loading = $('#loading');
const readerHost = $('#reader-host');

let settings = store.loadSettings();
let reader = null;
let readerFromOutside = false; // opened from another app: closing returns there

const URL_RE = /^\s*(https?:\/\/\S+)\s*$/i;
const URL_IN_TEXT = /https?:\/\/[^\s<>"'«»]+/i;

// ---------- Theme for the home screen ----------

function applyTheme() {
  const dark =
    settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  native?.setDarkTheme?.(dark);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------- Opening documents ----------

/**
 * @param {{title?: string, text?: string, paragraphs?: string[], headings?: number[], source?: string, url?: string}} item
 * @param {{external?: boolean}} [how]
 */
function openText(item, how = {}) {
  let paragraphs = item.paragraphs ?? toParagraphs(item.text ?? '');
  let headings = item.headings ?? [];
  if (!paragraphs.length) return false;
  let title = (item.title ?? '').trim();
  if (title && paragraphs[0] !== title && !paragraphs[0].startsWith(title)) {
    paragraphs = [title, ...paragraphs];
    headings = [0, ...headings.map((h) => h + 1)];
  }
  if (!title) title = paragraphs[0].length > 90 ? paragraphs[0].slice(0, 88).trimEnd() + '…' : paragraphs[0];

  const id = hashText(paragraphs.join('\n'));
  const words = tokenize(paragraphs).length;
  if (!words) return false;
  const saved = store.saveDoc({ id, title, paragraphs, headings, source: item.source ?? hostOf(item.url), url: item.url, words });
  mountReader(saved, how.external);
  return true;
}

function openSaved(id) {
  const doc = store.getDoc(id);
  if (doc) {
    store.saveDoc(doc); // bump to top
    mountReader(doc, false);
  }
}

function mountReader(doc, external) {
  reader?.destroy();
  readerFromOutside = !!external;
  const position = doc.position ?? 0;
  const resumed = position > 0 && position < doc.words - 1;
  home.hidden = true;
  loading.hidden = true;
  document.body.classList.add('reading');
  if (!native && history.state?.reader !== true) history.pushState({ reader: true }, '');
  reader = createReader(readerHost, {
    doc,
    settings,
    position: resumed ? position : 0,
    resumed,
    onSettings: (s) => {
      settings = s;
      store.saveSettings(s);
      applyTheme();
    },
    onPosition: (i) => store.savePosition(doc.id, i),
    onState: (s) => native?.setReading?.(s === 'playing'),
    onClose: () => closeReader(),
  });
}

function closeReader({ fromHistory = false } = {}) {
  if (!reader) return;
  reader.destroy();
  reader = null;
  document.body.classList.remove('reading');
  native?.setReading?.(false);
  showHome();
  if (readerFromOutside && native?.leave) {
    readerFromOutside = false;
    native.leave(); // back to the app the text came from
  } else if (!native && !fromHistory && history.state?.reader) {
    history.back();
  }
}

addEventListener('popstate', () => {
  if (reader) closeReader({ fromHistory: true });
});

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ---------- Links ----------

async function openUrl(url, how = {}) {
  showLoading('Récupération de l’article…');
  try {
    const article = native?.extractUrl ? await nativeExtract(url) : await workerExtract(url);
    const text = article.paragraphs?.join(' ') ?? article.content ?? '';
    if (text.split(/\s+/).length < 60) throw Object.assign(new Error('short'), { article });
    openText({ ...article, url }, how);
  } catch (err) {
    showHome();
    if (err.article && (err.article.paragraphs?.length || err.article.content)) {
      // Probably a paywall or a cookie wall: offer to read what we got, or to log in.
      showError('Le texte récupéré est très court (article payant ?).', [
        ['Lire quand même', () => openText({ ...err.article, url }, how)],
        native?.openBrowser && ['Ouvrir la page pour se connecter', () => native.openBrowser(url)],
      ]);
    } else {
      showError(
        native ? 'Impossible de récupérer cet article.' : 'Impossible de récupérer cet article. Copiez son texte et collez-le ici.',
        [native?.openBrowser && ['Ouvrir la page', () => native.openBrowser(url)]],
      );
    }
  }
}

async function workerExtract(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${EXTRACT_ENDPOINT}?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'error'), { article: data.content ? data : null });
    return { title: data.title, paragraphs: data.paragraphs ?? toParagraphs(data.content), source: data.source };
  } finally {
    clearTimeout(timer);
  }
}

const pendingExtractions = new Map();
let extractionSeq = 0;
function nativeExtract(url) {
  return new Promise((resolve, reject) => {
    const id = String(++extractionSeq);
    pendingExtractions.set(id, { resolve, reject });
    native.extractUrl(id, url);
  });
}

// ---------- Hooks the Android app calls ----------

window.__rsvp = {
  /** A new text arrived from another app (screen capture, share, text selection). */
  checkPayload() {
    const raw = native?.takePayload?.();
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    handleIncoming(payload, { external: !!payload.external });
  },
  extracted(id, json) {
    const p = pendingExtractions.get(id);
    if (!p) return;
    pendingExtractions.delete(id);
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (data?.error) p.reject(Object.assign(new Error(data.error), { article: data.paragraphs?.length ? data : null }));
      else p.resolve(data);
    } catch (e) {
      p.reject(e);
    }
  },
  /** Hardware back button. Returns true when handled. */
  back() {
    if (reader) {
      if (!reader.back()) closeReader();
      return true;
    }
    return false;
  },
  refreshSetup: renderAndroidSetup,
  pause() {
    reader?.pause();
  },
};

function handleIncoming({ title, text, url, source, paragraphs, headings }, how) {
  const urlOnly = url && !paragraphs?.length && (!text || text.trim() === url || URL_RE.test(text));
  if (urlOnly) return openUrl(url, how);
  if (!paragraphs?.length && text && URL_RE.test(text)) return openUrl(text.trim(), how);
  if (!paragraphs?.length && text && text.split(/\s+/).length < 40) {
    // Shared "title + link" from a news app: fetch the article behind the link.
    const link = (text.match(URL_IN_TEXT) ?? [])[0] ?? url;
    if (link) return openUrl(link, how);
  }
  if (!openText({ title, text, paragraphs, headings, url, source }, how)) showHome();
}

// ---------- Home ----------

function showHome() {
  home.hidden = false;
  loading.hidden = true;
  renderLibrary();
  renderAndroidSetup();
}

function showLoading(msg) {
  home.hidden = true;
  loading.hidden = false;
  loading.querySelector('p').textContent = msg;
}

function showError(message, buttons = []) {
  inputError.replaceChildren(document.createTextNode(message));
  for (const b of buttons.filter(Boolean)) {
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = b[0];
    btn.onclick = () => {
      inputError.hidden = true;
      b[1]();
    };
    inputError.append(document.createElement('br'), btn);
  }
  inputError.hidden = false;
}

function updateInput() {
  const v = input.value.trim();
  inputError.hidden = true;
  if (!v) {
    readBtn.disabled = true;
    inputInfo.textContent = '';
  } else if (URL_RE.test(v)) {
    readBtn.disabled = false;
    inputInfo.textContent = 'Lien';
  } else {
    const n = v.split(/\s+/).length;
    readBtn.disabled = n < 2;
    inputInfo.textContent = `${n.toLocaleString('fr-FR')} mot${n > 1 ? 's' : ''}`;
  }
}
input.addEventListener('input', updateInput);

readBtn.addEventListener('click', () => {
  const v = input.value.trim();
  if (!v) return;
  if (URL_RE.test(v)) openUrl(v);
  else openText({ text: v });
});

$('#paste').addEventListener('click', async () => {
  let text = native?.readClipboard?.() ?? '';
  if (!text) {
    try {
      text = await navigator.clipboard.readText();
    } catch {}
  }
  if (text) {
    input.value = text;
    updateInput();
  } else input.focus();
});

function renderLibrary() {
  const items = store.listLibrary();
  $('#library-section').hidden = !items.length;
  const ul = $('#library');
  ul.replaceChildren(
    ...items.map((e) => {
      const li = document.createElement('li');
      const pct = e.words > 1 ? Math.round((e.position / (e.words - 1)) * 100) : 0;
      li.innerHTML = `<button class="open"><span class="t"></span><span class="m"><span class="bar"><i style="width:${pct}%"></i></span><span class="meta"></span></span></button><button class="del" aria-label="Supprimer">×</button>`;
      li.querySelector('.t').textContent = e.title;
      const minutes = Math.max(1, Math.round(e.words / settings.wpm));
      li.querySelector('.meta').textContent = [e.source, pct ? `${pct} %` : `${minutes} min`].filter(Boolean).join(' · ');
      li.querySelector('.open').onclick = () => openSaved(e.id);
      li.querySelector('.del').onclick = () => {
        store.deleteDoc(e.id);
        renderLibrary();
      };
      return li;
    }),
  );
}

function renderAndroidSetup() {
  const box = $('#android-setup');
  if (!native) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const enabled = native.isScreenCaptureEnabled?.();
  if (enabled) {
    box.innerHTML = `
      <div class="ok"><span class="dot"></span><div>
        <h2>Lecture depuis les autres apps : activée</h2>
        <p>Dans n’importe quelle app (journal, navigateur, mails…), touchez le <b>bouton d’accessibilité</b> pour lire l’écran en cours. Vous pouvez aussi sélectionner du texte puis choisir « Lecture rapide », ou partager un lien.</p>
        <div class="row"><button class="ghost" data-a="settings">Réglages d’accessibilité</button></div>
      </div></div>`;
  } else {
    box.innerHTML = `
      <h2>Lire depuis n’importe quelle app</h2>
      <p>Pour lire ce qui est affiché dans vos applis (y compris les articles réservés aux abonnés), activez le service de lecture d’écran :</p>
      <ol>
        <li>Touchez « Activer » ci-dessous.</li>
        <li>Choisissez <b>Lecture rapide · lire l’écran</b> et activez-le.</li>
        <li>Activez aussi le <b>raccourci</b> : un bouton flottant apparaîtra.</li>
      </ol>
      ${
        native.needsRestrictedSettingsHint?.()
          ? `<p class="muted">Option grisée (« paramètre restreint ») ? Touchez « Infos de l’appli », puis ⋮ en haut à droite → <b>Autoriser les paramètres restreints</b>, et revenez.</p>`
          : ''
      }
      <p class="muted">Le texte n’est lu que quand vous touchez le bouton, et ne quitte jamais votre téléphone.</p>
      <div class="row"><button class="primary" data-a="settings">Activer</button>${
        native.needsRestrictedSettingsHint?.() ? '<button class="ghost" data-a="appinfo">Infos de l’appli</button>' : ''
      }</div>`;
  }
  box.querySelector('[data-a=settings]').onclick = () => native.openScreenCaptureSettings?.();
  const info = box.querySelector('[data-a=appinfo]');
  if (info) info.onclick = () => native.openAppInfo?.();
}

// ---------- Boot ----------

addFonts();
applyTheme();
if (!native) $('#web-help').hidden = false;
else $('#paste').hidden = false;

// Web Share Target (PWA): ?title=&text=&url=
const params = new URLSearchParams(location.search);
if (params.has('text') || params.has('url')) {
  history.replaceState(null, '', location.pathname);
  showHome();
  handleIncoming({ title: params.get('title') ?? '', text: params.get('text') ?? '', url: params.get('url') ?? '' }, {});
} else if (native?.takePayload) {
  showHome();
  window.__rsvp.checkPayload();
} else {
  showHome();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !reader) renderAndroidSetup();
});

if ('serviceWorker' in navigator && !native && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
