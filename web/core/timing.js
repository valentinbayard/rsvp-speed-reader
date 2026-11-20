import { letterCount, withoutFootnote } from './text.js';

export const MIN_WPM = 100;
export const MAX_WPM = 1200;
export const WPM_STEP = 25;

export const clampWpm = (wpm) =>
  Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(wpm / WPM_STEP) * WPM_STEP));

/**
 * Speed-independent cost of a token, in "beats".
 * `word` is the time to read the word itself, `pause` the punctuation pause
 * after it, and `minPauseMs` a floor for that pause, so sentence ends stay
 * noticeable at high speeds.
 *
 * Word lengths follow Spritz's patent (US 8,903,174): ×1.3 for words of more
 * than 7 letters, ×1.6 for more than 13. Sentence pauses are longer than the
 * patent's (1, 2.2, 3.3 beats): 2 beats after a sentence of up to 7 words,
 * 2.6 up to 22, 3.3 beyond, and at least 3.3 at the end of a paragraph.
 * @param {import('./text.js').Token} token
 */
export function tokenBeats(token) {
  const text = withoutFootnote(token.text);
  const letters = letterCount(text);
  let word = letters > 13 ? 1.6 : letters > 7 ? 1.3 : 1;
  if (/\d/.test(text)) word *= /\d{4,}|\d[.,\s\u202F]\d/.test(text) ? 1.5 : 1.25;
  else if (!token.sentenceStart && /^[^\p{L}]*\p{Lu}/u.test(text)) word *= 1.15;

  let pause = 0;
  let minPauseMs = 0;
  if (token.pause === 'sentence') {
    pause = sentencePause(token.sentenceWords);
    minPauseMs = SENTENCE_MIN_MS;
  } else if (token.pause === 'clause') pause = 0.6;
  if (token.paragraphEnd) {
    pause = Math.max(pause, 3.3);
    minPauseMs = PARAGRAPH_MIN_MS;
  }
  return { word, pause, minPauseMs };
}

const sentencePause = (words = 0) => (words > 22 ? 3.3 : words > 7 ? 2.6 : 2);
const SENTENCE_MIN_MS = 280;
const PARAGRAPH_MIN_MS = 450;

/**
 * Factor that makes the average word last exactly 60000 / wpm ms, so the speed
 * shown is the speed read (pauses come on top), as in the patent.
 */
export function wordScale(tokens) {
  let sum = 0;
  for (const t of tokens) sum += tokenBeats(t).word;
  return tokens.length ? tokens.length / sum : 1;
}

function durationOf({ word, pause, minPauseMs }, wpm, punctuation, scale) {
  const beat = (60000 / wpm) * scale;
  return beat * word + punctuation * (pause ? Math.max(beat * pause, minPauseMs) : 0);
}

/**
 * How long a token stays on screen, in ms.
 * @param {number} punctuation 0 = no pauses, 1 = normal, 1.6 = long
 * @param {number} scale from wordScale(tokens)
 */
export function tokenDuration(token, wpm, punctuation = 1, scale = 1) {
  return durationOf(tokenBeats(token), wpm, punctuation, scale);
}

/** Extra slowness for the first words after (re)starting, so the eye can lock on. */
export function rampFactor(wordsSinceStart, rampLength) {
  if (wordsSinceStart >= rampLength) return 1;
  const peak = rampLength > 6 ? 2 : 1.6;
  return peak - (peak - 1) * (wordsSinceStart / rampLength);
}

/**
 * Time left from a token, in ms. Prefix sums are computed once per speed and
 * punctuation setting, so each call is O(1).
 * @returns {(from: number, wpm: number, punctuation: number) => number} ms left from token `from`
 */
export function remainingTimer(tokens) {
  const beats = tokens.map(tokenBeats);
  const scale = wordScale(tokens);
  const cache = new Map();
  return (from, wpm, punctuation) => {
    const key = `${wpm}/${punctuation}`;
    let sums = cache.get(key);
    if (!sums) {
      sums = new Float64Array(beats.length + 1);
      beats.forEach((b, i) => (sums[i + 1] = sums[i] + durationOf(b, wpm, punctuation, scale)));
      if (cache.size > 8) cache.clear();
      cache.set(key, sums);
    }
    return sums[beats.length] - sums[from];
  };
}
