// Settings and reading history. localStorage can throw (private mode, quotas,
// sandboxed iframes), so every access is guarded.

const SETTINGS_KEY = 'rsvp.settings';
const LIBRARY_KEY = 'rsvp.library';
const DOC_PREFIX = 'rsvp.doc.';
const MAX_DOCS = 40;

export const DEFAULT_SETTINGS = {
  wpm: 400,
  fontSize: 1, // multiplier
  theme: 'light', // light | dark | auto
  punctuation: 1, // 0 | 1 | 1.6
  smartResume: true,
  autoStart: true,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}

/**
 * Library entries are small ({id, title, source, words, position, updatedAt});
 * the full text of each document is stored under its own key.
 */
export function listLibrary() {
  return read(LIBRARY_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDoc(id) {
  return read(DOC_PREFIX + id, null);
}

export function saveDoc(doc) {
  const lib = listLibrary().filter((e) => e.id !== doc.id);
  const existing = read(DOC_PREFIX + doc.id, null);
  const entry = {
    id: doc.id,
    title: doc.title,
    source: doc.source ?? null,
    words: doc.words,
    position: existing?.position ?? doc.position ?? 0,
    updatedAt: Date.now(),
  };
  lib.unshift(entry);
  for (const old of lib.splice(MAX_DOCS)) remove(DOC_PREFIX + old.id);
  const full = { ...doc, position: entry.position };
  // On quota errors, evict the oldest documents until it fits.
  while (!write(DOC_PREFIX + doc.id, full) && lib.length > 1) remove(DOC_PREFIX + lib.pop().id);
  write(LIBRARY_KEY, lib);
  return full;
}

export function savePosition(id, position) {
  const doc = read(DOC_PREFIX + id, null);
  if (!doc) return;
  doc.position = position;
  write(DOC_PREFIX + id, doc);
  const lib = read(LIBRARY_KEY, []);
  const entry = lib.find((e) => e.id === id);
  if (entry) {
    entry.position = position;
    entry.updatedAt = Date.now();
    write(LIBRARY_KEY, lib);
  }
}

export function deleteDoc(id) {
  remove(DOC_PREFIX + id);
  write(LIBRARY_KEY, read(LIBRARY_KEY, []).filter((e) => e.id !== id));
}
