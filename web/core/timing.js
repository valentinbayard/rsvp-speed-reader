import { letterCount } from './text.js';

export const MIN_WPM = 100;
export const MAX_WPM = 1200;
export const WPM_STEP = 25;

export const clampWpm = (wpm) =>
  Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(wpm / WPM_STEP) * WPM_STEP));

/**
 * Speed-independent cost of a token, in "beats".
 * `word` is the time to read the word itself, `pause` the punctuation pause after it.
 *
 * Word lengths and sentence pauses follow Spritz's patent (US 8,903,174):
 * ×1.3 for words of more than 7 letters, ×1.6 for more than 13; after a
 * sentence, a pause of 1 beat (up to 7 words), 2.2 (up to 22) or 3.3.
 * @param {import('./text.js').Token} token
 */
export function tokenBeats(token) {
  const letters = letterCount(token.text);
  let word = letters > 13 ? 1.6 : letters > 7 ? 1.3 : 1;
  if (/\d/.test(token.text)) word *= /\d{4,}|\d[.,\s\u202F]\d/.test(token.text) ? 1.5 : 1.25;
  else if (!token.sentenceStart && /^[^\p{L}]*\p{Lu}/u.test(token.text)) word *= 1.15;

  let pause = 0;
  if (token.pause === 'sentence') pause = sentencePause(token.sentenceWords);
  else if (token.pause === 'clause') pause = 0.6;
  if (token.paragraphEnd) pause = Math.max(pause, 2.2);
  return { word, pause };
}

const sentencePause = (words = 0) => (words > 22 ? 3.3 : words > 7 ? 2.2 : 1);

/**
 * Factor that makes the average word last exactly 60000 / wpm ms, so the speed
 * shown is the speed read (pauses come on top), as in the patent.
 */
export function wordScale(tokens) {
  let sum = 0;
  for (const t of tokens) sum += tokenBeats(t).word;
  return tokens.length ? tokens.length / sum : 1;
}

/**
 * How long a token stays on screen, in ms.
 * @param {number} punctuation 0 = no pauses, 1 = normal, 1.6 = long
 * @param {number} scale from wordScale(tokens)
 */
export function tokenDuration(token, wpm, punctuation = 1, scale = 1) {
  const { word, pause } = tokenBeats(token);
  return (60000 / wpm) * scale * (word + pause * punctuation);
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
  const scale = wordScale(tokens);
  return (from, wpm, punctuation) =>
    (60000 / wpm) * scale * (words[n] - words[from] + punctuation * (pauses[n] - pauses[from]));
}
