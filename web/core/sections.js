import { paragraphStart } from './text.js';

const ENDS_LIKE_PROSE = /[.!?…:;,»”"')\]]$/u;
const ENDS_PARAGRAPH = /[.!?…»”"')\]]$/u;
const words = (s) => s.split(/\s+/).filter(Boolean).length;

/**
 * Guesses section titles in plain text (pasted text, or an app that does not
 * mark its headings): a short line that does not read like a sentence, sitting
 * between the end of a paragraph and a real paragraph.
 * @param {string[]} paragraphs
 * @returns {number[]} paragraph indexes
 */
export function inferHeadings(paragraphs) {
  const out = [];
  for (let i = 0; i < paragraphs.length - 1; i++) {
    const s = paragraphs[i];
    const n = words(s);
    if (n < 1 || n > 12 || s.length > 90) continue;
    if (ENDS_LIKE_PROSE.test(s) || /^[\p{Ll}\d«"“(—–-]/u.test(s)) continue;
    // A real paragraph must follow (for the very first line, a byline may sit in between).
    const next = i === 0 ? paragraphs.slice(1, 3) : [paragraphs[i + 1]];
    if (!next.some((q) => words(q) >= 15)) continue;
    if (i > 0 && !ENDS_PARAGRAPH.test(paragraphs[i - 1])) continue; // e.g. a byline under the title
    out.push(i);
  }
  return out;
}

/**
 * Headings to use for a document: the ones it came with, plus guessed ones
 * when it came with none besides its title.
 */
export function resolveHeadings(paragraphs, headings = []) {
  const given = [...new Set(headings)].filter((h) => h >= 0 && h < paragraphs.length);
  if (given.some((h) => h > 0)) return given.sort((a, b) => a - b);
  return [...new Set([...given, ...inferHeadings(paragraphs)])].sort((a, b) => a - b);
}

/**
 * Table of contents. Text before the first heading becomes a section of its
 * own, titled `startLabel`.
 * @returns {{title: string, p: number, index: number}[]}
 */
export function buildSections(paragraphs, tokens, headings, startLabel) {
  const sections = headings
    .map((p) => ({ title: paragraphs[p], p, index: paragraphStart(tokens, p) }))
    .filter((s) => tokens[s.index]?.p === s.p);
  if (!sections.length || sections[0].index > 0) sections.unshift({ title: startLabel, p: 0, index: 0 });
  return sections;
}

/** Index of the section containing token `i`. */
export function sectionAt(sections, i) {
  let lo = 0, hi = sections.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sections[mid].index <= i) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
