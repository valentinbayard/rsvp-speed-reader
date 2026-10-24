// Where long words may be split: Liang's algorithm (the one TeX and browsers
// use) with the standard TeX patterns for French and English, and a simple
// syllable rule for other languages.

import * as fr from '../vendor/hyph-fr.js';
import * as en from '../vendor/hyph-en.js';

const SOURCES = { fr, en };
const compiled = {};
const VOWEL = /[aeiouyàâäéèêëîïôöùûüÿœæåøáíóúãõ]/u;

function compile({ patterns, exceptions }) {
  const map = new Map();
  let maxLen = 0;
  for (const pat of patterns.split(' ')) {
    const letters = pat.replace(/\d/g, '');
    const digits = [0];
    for (const c of pat) {
      if (/\d/.test(c)) digits[digits.length - 1] = +c;
      else digits.push(0);
    }
    map.set(letters, digits);
    maxLen = Math.max(maxLen, letters.length);
  }
  const exc = new Map();
  for (const w of exceptions.split(' ').filter(Boolean)) {
    const points = [];
    let n = 0;
    for (const c of w) c === '-' ? points.push(n) : n++;
    exc.set(w.replace(/-/g, ''), points);
  }
  return { map, maxLen, exc };
}

function liang(lower, lang) {
  const { map, maxLen, exc } = (compiled[lang] ??= compile(SOURCES[lang]));
  const exception = exc.get(lower.join(''));
  if (exception) return exception;
  const chars = ['.', ...lower, '.'];
  const scores = new Array(chars.length + 1).fill(0);
  for (let i = 0; i < chars.length; i++) {
    let key = '';
    for (let j = i; j < Math.min(chars.length, i + maxLen); j++) {
      key += chars[j];
      const digits = map.get(key);
      if (!digits) continue;
      digits.forEach((d, k) => {
        if (d > scores[i + k]) scores[i + k] = d;
      });
    }
  }
  // scores[k] is the gap before chars[k]; chars[k] is letter k-1 of the word.
  const points = [];
  for (let i = 2; i <= lower.length - 2; i++) if (scores[i + 1] % 2) points.push(i);
  return points;
}

/**
 * Breaks before the consonants that start a syllable, keeping common
 * clusters together: ta|ble, dampf|schiff, in|fra.
 */
function syllables(lower) {
  const v = lower.map((c) => VOWEL.test(c));
  const points = [];
  for (let j = 1; j < lower.length; j++) {
    if (!v[j] || v[j - 1]) continue;
    let a = j;
    while (a > 0 && !v[a - 1]) a--;
    if (a === 0) continue; // no vowel before: still the first syllable
    const run = lower.slice(a, j).join('');
    const onset = Math.min(run.length, /sch$/.test(run) ? 3 : /(?:[cpst]h|[bcdfgkptv][lr])$/.test(run) ? 2 : 1);
    const at = j - onset;
    if (at >= 2 && at <= lower.length - 2) points.push(at);
  }
  return points;
}

/**
 * Where a word may be hyphenated, as code point offsets (a break at `i` falls
 * between letters i-1 and i), with at least two letters on each side.
 * @param {string} word letters only
 * @param {string|null} lang 'fr', 'en', or anything else for the generic rule
 */
export function hyphenationPoints(word, lang) {
  const lower = Array.from(word.toLowerCase());
  if (lower.length !== Array.from(word).length) return [];
  return SOURCES[lang] ? liang(lower, lang) : syllables(lower);
}
