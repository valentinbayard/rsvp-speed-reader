// Turns raw text into paragraphs, and paragraphs into display tokens.
//
// Every token keeps the character range it came from in its paragraph, so the
// paused "context" view can show the original text and map a tap on any
// character back to a token (and vice versa).

const OPENING = /^[«“‘"'(\[{¿¡—–-]+$/u;
const CLOSING = /^[»”’"')\]}.,;:!?…%‰€$£¥]+$/u;
const LETTER = /[\p{L}\p{N}]/u;
const SENTENCE_END = /[.!?…]+[\s»”’"')\]]*$/u;
const CLAUSE_END = /[,;:]+[\s»”’"')\]]*$/u;
const CLOSE_BRACKET = /[)\]][\s»”’"']*$/u;
// "[…]" marks words left out of a quotation, mid-sentence.
const ELIDED = /^[(\[](?:…|\.{3})[)\]][^\p{L}\p{N}]*$/u;
// Digit groups split by a (narrow no-break) space are one number: 12 000, 1 500 000.
const THOUSANDS_HEAD = /^[^\p{L}\p{N}]*[+\-−]?\d{1,3}(?:\s\d{3})*$/u;
const THOUSANDS_GROUP = /^\d{3}(?!\d)/u;

// Lower-cased abbreviations that end with a dot but do not end a sentence.
const ABBREVIATIONS = new Set([
  'm', 'mm', 'mme', 'mmes', 'mlle', 'dr', 'pr', 'me', 'mgr', 'st', 'ste',
  'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'vs', 'cf', 'ex', 'p', 'pp', 'vol',
  'n', 'no', 'av', 'bd', 'env', 'fig', 'chap', 'art', 'al', 'éd', 'ed',
  't', 'hab', 'coll', 'ibid', 'op', 'cit', 'trad', 'cie', 'tél', 'sq', 'sqq',
  'e.g', 'i.e', 'approx', 'janv', 'févr', 'avr', 'juil', 'sept', 'oct', 'nov', 'déc',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'dec',
]);

/**
 * Splits pasted / extracted text into clean paragraphs.
 * Blank lines separate paragraphs. When the text has no blank lines at all,
 * single line breaks are treated as paragraph breaks (typical of copied text).
 */
export function toParagraphs(raw) {
  if (Array.isArray(raw)) return raw.map(cleanLine).filter(Boolean);
  const text = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '');
  const blocks = /\n[ \t ]*\n/.test(text) ? text.split(/\n[ \t ]*\n+/) : text.split('\n');
  return blocks.map(cleanLine).filter(Boolean);
}

function cleanLine(s) {
  return String(s).normalize('NFC').replace(/[ \t\n\f\v]+/g, ' ').trim();
}

/**
 * Tokenizes paragraphs into words to flash, one by one.
 * @param {string[]} paragraphs
 * @returns {Token[]}
 *
 * @typedef {Object} Token
 * @property {string} text   what is displayed
 * @property {number} p      paragraph index
 * @property {number} start  char offset in paragraph (inclusive)
 * @property {number} end    char offset in paragraph (exclusive)
 * @property {boolean} sentenceStart
 * @property {boolean} paragraphEnd
 * @property {'sentence'|'clause'|null} pause  punctuation that ends the token
 * @property {number} orp    index into `text` of the focus letter
 */
export function tokenize(paragraphs) {
  const tokens = [];
  paragraphs.forEach((para, p) => {
    const runs = [];
    for (const m of para.matchAll(/\S+/gu)) runs.push({ start: m.index, end: m.index + m[0].length });

    // Glue lone punctuation to its neighbour (« Bonjour ! » → «Bonjour !»).
    const merged = [];
    let pendingOpen = null;
    for (const run of runs) {
      const s = para.slice(run.start, run.end);
      const prev = merged[merged.length - 1];
      // A dash or a bracket opens an aside: pause before it, as for a comma.
      if (prev && (s === '-' || /^[(\[—–]/u.test(s)) && !ELIDED.test(s)) prev.breakAfter = true;
      if (pendingOpen) {
        run.start = pendingOpen.start;
        pendingOpen = null;
      } else if (prev && run.start - prev.end === 1 && THOUSANDS_GROUP.test(s) && THOUSANDS_HEAD.test(para.slice(prev.start, prev.end))) {
        prev.end = run.end;
        continue;
      }
      if (CLOSING.test(s) && merged.length && !OPENING.test(s)) {
        prev.end = run.end;
      } else if (OPENING.test(s) && !LETTER.test(s)) {
        // Opening quotes and dashes lean on the next word; a stray trailing one
        // on the previous word.
        pendingOpen = run;
      } else {
        merged.push(run);
      }
    }
    if (pendingOpen) {
      if (merged.length) merged[merged.length - 1].end = pendingOpen.end;
      else merged.push(pendingOpen);
    }

    let sentenceStart = true;
    merged.forEach((run, i) => {
      const raw = para.slice(run.start, run.end);
      const text = raw.replace(/\s+/gu, '\u202F');
      const isLast = i === merged.length - 1;
      const next = isLast ? '' : para.slice(merged[i + 1].start, merged[i + 1].end);
      let pause = null;
      if (SENTENCE_END.test(raw) && !ELIDED.test(raw)) {
        const abbr = abbreviation(raw);
        // « Viens ! » dit-il : a lower-case word after the stop continues the sentence.
        if (!abbr) pause = /^[^\p{L}\p{N}]*\p{Ll}/u.test(next) ? 'clause' : 'sentence';
        else if (abbr === 'maybe' && (isLast || /^[^\p{L}\p{N}]*\p{Lu}/u.test(next))) pause = 'sentence';
      }
      if (!pause && (CLAUSE_END.test(raw) || CLOSE_BRACKET.test(raw) || ELIDED.test(raw) || run.breakAfter)) pause = 'clause';
      tokens.push({
        text,
        p,
        start: run.start,
        end: run.end,
        sentenceStart,
        paragraphEnd: isLast,
        pause,
        orp: orpIndex(text),
      });
      sentenceStart = pause === 'sentence';
    });
  });
  return tokens;
}

/** 'always' for known abbreviations and initials, 'maybe' for dotted acronyms (J.-C., S.A.). */
function abbreviation(word) {
  const core = word.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[\s»”’"')\]]+$/u, '');
  if (!core.endsWith('.') || core.endsWith('..')) return null;
  const stem = core.slice(0, -1);
  if (/^\p{Lu}$/u.test(stem)) return 'always'; // initials: J. K. Rowling
  if (ABBREVIATIONS.has(stem.toLowerCase())) return 'always';
  if (/^\p{L}{1,2}(?:\.-?\p{L}{1,2})+$/u.test(stem)) return 'maybe';
  return null;
}

/**
 * Optimal recognition point: the letter the eye should land on, just left of
 * the middle (the word-length table of Spritz-style readers). Counted on letters only, so
 * quotes, apostrophes (l'œil, c'est) and hyphens are never highlighted.
 */
export function orpIndex(text) {
  const chars = Array.from(text);
  const letters = [];
  chars.forEach((c, k) => LETTER.test(c) && letters.push(k));
  if (!letters.length) return chars.slice(0, Math.floor((chars.length - 1) / 2)).join('').length;
  const n = letters.length;
  const offset = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
  // Index in UTF-16 units of the chosen code point.
  return chars.slice(0, letters[offset]).join('').length;
}

/** Number of letters in a token (for timing). */
export function letterCount(text) {
  let n = 0;
  for (const c of text) if (LETTER.test(c)) n++;
  return n;
}

/** Index of the first token of the sentence containing `i`. */
export function sentenceStartOf(tokens, i) {
  while (i > 0 && !tokens[i].sentenceStart) i--;
  return Math.max(0, i);
}

/** First token of the previous sentence (or of the current one if we are well into it). */
export function previousSentence(tokens, i) {
  const start = sentenceStartOf(tokens, i);
  if (i - start > 2 || start === 0) return start;
  return sentenceStartOf(tokens, start - 1);
}

export function nextSentence(tokens, i) {
  for (let j = i + 1; j < tokens.length; j++) if (tokens[j].sentenceStart) return j;
  return tokens.length - 1;
}

export function paragraphStart(tokens, p) {
  let lo = 0, hi = tokens.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid].p < p) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Token index for a character offset in paragraph `p` (nearest token at or after it). */
export function tokenAt(tokens, p, offset) {
  let i = paragraphStart(tokens, p);
  if (!tokens[i] || tokens[i].p !== p) return Math.min(i, tokens.length - 1);
  while (i + 1 < tokens.length && tokens[i + 1].p === p && tokens[i].end <= offset) i++;
  return i;
}

/** Stable short id for a text, used to remember reading positions. */
export function hashText(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
