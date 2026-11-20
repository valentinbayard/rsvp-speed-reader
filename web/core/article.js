// Plain text copied from a whole web page: finding the article in it, and
// finding a selected word in an article.

const words = (s) => (s.match(/\S+/gu) ?? []).length;
const ENDS_LIKE_SENTENCE = /[.!?…:;»”"')\]]$/u;

/** A paragraph of running text, as opposed to a menu entry, a caption or a tag. */
function isProse(s) {
  const n = words(s);
  return n >= 12 || (n >= 5 && ENDS_LIKE_SENTENCE.test(s));
}

/** Prose that can open an article: a real paragraph, not a one-line notice. */
function opensArticle(s) {
  return words(s) >= 25 || (isProse(s) && /[.!?…»”"]$/u.test(s));
}

/** A line that can be the article's title. */
function looksLikeTitle(s) {
  const n = words(s);
  return (
    n >= 3 &&
    n <= 16 &&
    !/[.,;:]$/u.test(s) &&
    !/\d\s*$/u.test(s) && // dates, captions: "…, 2023-2024"
    !/^(©|\(c\)|photo|illustration|crédit|credit|source)/iu.test(s) &&
    !/(^|,\s*)(par|by)\s+\p{Lu}/u.test(s) && // byline: "Éditorial, par Renaud Lambert"
    /\p{L}/u.test(s)
  );
}

// More than this many non-prose lines in a row ends the article (menus, tags, footer).
const MAX_GAP = 3;

/**
 * Keeps the article out of everything a page shows: menus before it, related
 * links and footer after it. The article is the run of prose paragraphs with
 * the most words; short lines inside it (subheadings) are kept, lines of a
 * single word (buttons) are not. Its title is looked for just above it.
 *
 * Returns null when there is nothing to remove.
 * @param {string[]} paragraphs
 * @returns {{title: string|null, paragraphs: string[]} | null}
 */
export function findArticle(paragraphs) {
  // Runs of prose with at most MAX_GAP other lines between two paragraphs.
  // Lines that end like a sentence (dialogue: « Oui. ») do not count as a gap.
  const runs = [];
  let run = null;
  let gap = 0;
  let totalProse = 0;
  paragraphs.forEach((s, i) => {
    if (!isProse(s)) {
      if (run && !ENDS_LIKE_SENTENCE.test(s)) gap++;
      return;
    }
    totalProse += words(s);
    if (run && gap <= MAX_GAP) {
      run.last = i;
      run.words += words(s);
    } else if (opensArticle(s)) {
      run = { first: i, last: i, words: words(s) };
      runs.push(run);
    } else run = null;
    gap = 0;
  });
  if (!runs.length) return null;
  const body = runs.reduce((a, b) => (b.words > a.words ? b : a));
  // Only cut menus and the like: if a good part of the prose is outside the
  // body, the guess is not safe.
  if (body.words < totalProse * 0.8) return null;

  // Title: the nearest title-like line above the body, among the few lines before it.
  let titleIndex = -1;
  for (let i = body.first - 1; i >= Math.max(0, body.first - 10); i--) {
    if (looksLikeTitle(paragraphs[i])) {
      titleIndex = i;
      break;
    }
  }
  const first = titleIndex >= 0 ? titleIndex : body.first;
  if (first < 3 && paragraphs.length - 1 - body.last < 3) return null; // nothing worth removing

  const kept = [];
  if (titleIndex >= 0) {
    kept.push(paragraphs[titleIndex]);
    // A lede between the title and the text.
    for (let i = titleIndex + 1; i < body.first; i++) {
      const s = paragraphs[i];
      if (words(s) >= 6 && /[.!?…]$/u.test(s)) kept.push(s);
    }
  }
  for (let i = body.first; i <= body.last; i++) {
    const s = paragraphs[i];
    if (words(s) >= 2 || ENDS_LIKE_SENTENCE.test(s)) kept.push(s);
  }
  return { title: titleIndex >= 0 ? paragraphs[titleIndex] : null, paragraphs: kept };
}

const norm = (s) => s.normalize('NFC').replace(/\s+/gu, ' ').replace(/[’‘]/g, "'").toLowerCase();

/**
 * A passage selected on the page. `text` is what was selected; `before` and
 * `after`, the text around it on the page, tell repeats apart. Without them,
 * the first occurrence among paragraphs `fromParagraph`..`toParagraph` (the
 * ones that were on screen) is taken.
 * @typedef {{text: string, before?: string, after?: string, fromParagraph?: number, toParagraph?: number}} Start
 */

/**
 * Finds where a selected passage is in the article.
 * @param {string[]} paragraphs
 * @param {Start} start
 * @returns {{p: number, offset: number} | null}
 */
export function locate(paragraphs, start) {
  const text = norm(start?.text ?? '').trim();
  if (!text) return null;
  const before = norm(start.before ?? '');
  const after = norm(start.after ?? '');
  let best = null;
  paragraphs.forEach((para, p) => {
    // Offsets in `norm(para)` match `para` as long as normalising keeps lengths,
    // which it does for text that is already NFC with single spaces.
    const hay = norm(para);
    for (let k = hay.indexOf(text); k >= 0; k = hay.indexOf(text, k + 1)) {
      let score = commonSuffix(hay.slice(0, k), before) + commonPrefix(hay.slice(k + text.length), after);
      const from = start.fromParagraph ?? -1;
      const to = start.toParagraph ?? -1;
      if ((from >= 0 && p < from) || (to >= 0 && p > to)) score -= 1e6;
      // Prefer whole words.
      if (/[\p{L}\p{N}]/u.test(hay[k - 1] ?? '')) score -= 5;
      if (score > (best?.score ?? -Infinity)) best = { p, offset: k, score };
    }
  });
  if (!best) return null;
  // Start at the beginning of the word the selection starts in.
  const para = paragraphs[best.p];
  let offset = best.offset;
  while (offset > 0 && /\S/u.test(para[offset - 1])) offset--;
  return { p: best.p, offset };
}

function commonSuffix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}
