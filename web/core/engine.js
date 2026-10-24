import { tokenDuration, rampFactor, clampWpm } from './timing.js';
import { sentenceStartOf } from './text.js';

/**
 * Plays tokens one after the other. Knows nothing about the DOM.
 *
 * Events (via `on`): 'word' (index), 'state' ('playing' | 'paused' | 'ended'), 'wpm' (wpm)
 */
export class Engine {
  constructor(tokens, { wpm = 400, punctuation = 1, smartResume = true, now, setTimer, clearTimer } = {}) {
    this.tokens = tokens;
    this.index = 0;
    this.wpm = clampWpm(wpm);
    this.punctuation = punctuation;
    this.smartResume = smartResume;
    this.state = 'paused';
    this.readMs = 0; // time actually spent playing
    this._listeners = {};
    this._timer = null;
    this._pausedAt = null; // index where the last pause happened
    this._now = now ?? (() => performance.now());
    this._setTimer = setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this._clearTimer = clearTimer ?? ((t) => clearTimeout(t));
  }

  on(event, fn) {
    (this._listeners[event] ??= []).push(fn);
    return this;
  }

  _emit(event, value) {
    for (const fn of this._listeners[event] ?? []) fn(value);
  }

  get current() {
    return this.tokens[this.index];
  }

  get isPlaying() {
    return this.state === 'playing';
  }

  /**
   * Starts or resumes playback. When resuming at the exact word we paused on,
   * and smartResume is on, we step back to the start of the sentence (at most
   * 10 words) so the brain gets its context back.
   */
  play({ rewind = true } = {}) {
    if (!this.tokens.length || this.isPlaying) return;
    if (this.state === 'ended') this.index = 0;
    if (rewind && this.smartResume && this._pausedAt === this.index && this.index > 0) {
      const start = sentenceStartOf(this.tokens, this.index);
      this.index = this.index - start <= 10 ? start : this.index - 4;
    }
    this._pausedAt = null;
    this._sinceStart = 0;
    this._rampLength = this.readMs === 0 ? 8 : 4;
    this.state = 'playing';
    this._emit('state', this.state);
    this._emit('word', this.index);
    this._lastTick = this._now();
    this._schedule(this._now());
  }

  pause() {
    if (!this.isPlaying) return;
    this._clearTimer(this._timer);
    this._timer = null;
    this.readMs += this._now() - this._lastTick;
    this.state = 'paused';
    this._pausedAt = this.index;
    this._emit('state', this.state);
  }

  toggle() {
    this.isPlaying ? this.pause() : this.play();
  }

  /** Jumps to a token. Keeps playing if playing. */
  seek(index) {
    const i = Math.max(0, Math.min(this.tokens.length - 1, index));
    if (this.state === 'ended') this.state = 'paused';
    this.index = i;
    this._pausedAt = null;
    this._emit('word', i);
    if (this.isPlaying) {
      this._clearTimer(this._timer);
      this._sinceStart = 0;
      this._rampLength = 3;
      this._schedule(this._now());
    }
  }

  setWpm(wpm) {
    this.wpm = clampWpm(wpm);
    this._emit('wpm', this.wpm);
  }

  durationOf(i) {
    return tokenDuration(this.tokens[i], this.wpm, this.punctuation) * rampFactor(this._sinceStart, this._rampLength);
  }

  _schedule(shownAt) {
    const due = shownAt + this.durationOf(this.index);
    this._timer = this._setTimer(() => this._advance(due), Math.max(0, due - this._now()));
  }

  _advance(due) {
    const now = this._now();
    this.readMs += now - this._lastTick;
    this._lastTick = now;
    if (this.index >= this.tokens.length - 1) {
      this._timer = null;
      this.state = 'ended';
      this._emit('state', this.state);
      return;
    }
    this.index++;
    this._sinceStart++;
    this._emit('word', this.index);
    // Schedule from when the word was due, not when the timer fired, to avoid drift;
    // but never try to catch up more than a frame.
    this._schedule(Math.max(due, now - 16));
  }

  destroy() {
    this._clearTimer(this._timer);
    this._listeners = {};
  }
}
