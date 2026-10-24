import { letterCount } from './text.js';

export const MIN_WPM = 100;
export const MAX_WPM = 1200;
export const WPM_STEP = 25;

export const clampWpm = (wpm) =>
  Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(wpm / WPM_STEP) * WPM_STEP));

/**
 * Speed-independent cost of a token, in "beats" (1 beat = 60000 / wpm ms).
 * `word` is the time to read the word itself, `pause` the punctuation pause after it.
 * @param {import('./text.js').Token} token
 */
export function tokenBeats(token) {
  let word = 1;
  const letters = letterCount(token.text);
  if (letters > 7) word *= Math.min(1.7, 1 + (letters - 7) * 0.08);
  if (/\d/.test(token.text)) word *= /\d{4,}|\d[.,\s ]\d/.test(token.text) ? 1.5 : 1.25;
  else if (!token.sentenceStart && /^[^\p{L}]*\p{Lu}/u.test(token.text)) word *= 1.15;

  let pause = 0;
  if (token.paragraphEnd) pause = 2.2;
  else if (token.pause === 'sentence') pause = 1.6;
  else if (token.pause === 'clause') pause = 0.6;
  return { word, pause };
}

/**
 * How long a token stays on screen, in ms.
 * @param {number} punctuation 0 = no pauses, 1 = normal, 1.6 = long
 */
export function tokenDuration(token, wpm, punctuation = 1) {
  const { word, pause } = tokenBeats(token);
  return (60000 / wpm) * (word + pause * punctuation);
}

/** Extra slowness for the first words after (re)starting, so the eye can lock on. */
export function rampFactor(wordsSinceStart, rampLength) {
  if (wordsSinceStart >= rampLength) return 1;
  const peak = rampLength > 6 ? 2 : 1.6;
  return peak - (peak - 1) * (wordsSinceStart / rampLength);
}

/**
 * Prefix sums of beats so that remaining time can be computed in O(1).
 * @returns {(from: number, wpm: number, punctuation: number) => number} ms left from token `from`
 */
export function remainingTimer(tokens) {
  const words = new Float64Array(tokens.length + 1);
  const pauses = new Float64Array(tokens.length + 1);
  tokens.forEach((t, i) => {
    const b = tokenBeats(t);
    words[i + 1] = words[i] + b.word;
    pauses[i + 1] = pauses[i] + b.pause;
  });
  const n = tokens.length;
  return (from, wpm, punctuation) =>
    (60000 / wpm) * (words[n] - words[from] + punctuation * (pauses[n] - pauses[from]));
}
