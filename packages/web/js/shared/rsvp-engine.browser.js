// RSVP Engine - Browser bundle (auto-generated)
// Do not edit directly - edit src/rsvp-engine.js instead

(function(global) {
  'use strict';

// RSVP Engine - Core reading logic
// Shared between Chrome Extension and PWA

/**
 * Calculate the Optimal Recognition Point (ORP) index for a word
 * @param {string} word - The word to calculate ORP for
 * @returns {number} Index of the ORP character
 */
function getORPIndex(word) {
  const len = word.length;
  if (len <= 1) return 0;
  if (len === 2) return 0;
  if (len === 3) return 1;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return Math.floor(len * 0.25);
}

/**
 * Process a word and extract metadata
 * @param {string} word - Raw word string
 * @returns {Object|null} Word object with metadata
 */
function processWord(word) {
  const trimmed = word.trim();
  if (!trimmed) return null;

  // Check for punctuation
  const hasEndPunctuation = /[.!?]$/.test(trimmed);
  const hasPausePunctuation = /[,;:]$/.test(trimmed);

  // Check for long numbers (4+ digits)
  const hasLongNumber = /\d{4,}/.test(trimmed);

  // Remove punctuation for display but keep track of it
  const cleanWord = trimmed.replace(/[.,;:!?]$/g, '');
  const punctuation = trimmed.slice(cleanWord.length);

  return {
    text: cleanWord,
    punctuation: punctuation,
    length: cleanWord.length,
    orpIndex: getORPIndex(cleanWord),
    isEndOfSentence: hasEndPunctuation,
    hasPause: hasPausePunctuation && !hasEndPunctuation,
    hasLongNumber: hasLongNumber
  };
}

/**
 * Parse text into an array of word objects
 * @param {string} text - Text to parse
 * @returns {Array<Object>} Array of word objects
 */
function parseTextToWords(text) {
  const rawWords = text.split(/\s+/);

  // Merge special punctuation with adjacent words
  // « attaches to following word
  // » : ; attaches to previous word
  const mergedWords = [];
  for (let i = 0; i < rawWords.length; i++) {
    const word = rawWords[i];

    // Skip empty
    if (!word) continue;

    // Opening quote (possibly with punctuation after) - attach to next word
    if (/^«+[.,;:!?»]*$/.test(word) && i + 1 < rawWords.length) {
      rawWords[i + 1] = word + rawWords[i + 1];
      continue;
    }

    // Closing quote or double punctuation alone (possibly with more punctuation) - attach to previous word
    // Includes: » : ; ! ? (French typography uses space before these)
    if (/^[»:;!?]+[.,;:!?»]*$/.test(word) && mergedWords.length > 0) {
      const lastIdx = mergedWords.length - 1;
      mergedWords[lastIdx] = mergedWords[lastIdx] + word;
      continue;
    }

    mergedWords.push(word);
  }

  // Split hyphenated words: "Notre-Dame-de-Betharam" → ["Notre-", "Dame-", "de-", "Betharam"]
  const expandedWords = [];
  for (const word of mergedWords) {
    if (word.includes('-') && word.length > 1) {
      const parts = word.split('-');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) {
          // Add hyphen to end of each part except the last
          const part = i < parts.length - 1 ? parts[i] + '-' : parts[i];
          expandedWords.push(part);
        }
      }
    } else {
      expandedWords.push(word);
    }
  }

  const words = expandedWords
    .map(processWord)
    .filter(word => word !== null);

  // Second pass: detect probable proper nouns
  // A capitalized word NOT at the start of a sentence is likely a proper noun
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const firstChar = word.text.charAt(0);
    const isCapitalized = firstChar && firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();

    // First word or word after end of sentence = not a proper noun indicator
    const prevWord = i > 0 ? words[i - 1] : null;
    const isAfterSentenceEnd = !prevWord || prevWord.isEndOfSentence;

    word.isProbableProperNoun = isCapitalized && !isAfterSentenceEnd;
  }

  return words;
}

/**
 * Calculate the duration to display a word
 * @param {Object} wordObj - Word object
 * @param {number} baseWPM - Base words per minute
 * @param {Object} settings - Reading settings
 * @returns {number} Duration in milliseconds
 */
function getWordDuration(wordObj, baseWPM, settings = {}) {
  const baseDuration = 60000 / baseWPM;
  let duration = baseDuration;

  // Adjust for word length
  if (settings.adjustForWordLength && wordObj.length > 8) {
    duration *= 1 + (wordObj.length - 8) * 0.1;
  }

  // Slow down for long numbers (years, etc.)
  if (wordObj.hasLongNumber) {
    duration *= 1.5;
  }

  // Slow down for probable proper nouns (capitalized mid-sentence)
  if (wordObj.isProbableProperNoun) {
    duration *= 1.3;
  }

  // Add pause for punctuation
  if (settings.pauseOnPunctuation) {
    if (wordObj.isEndOfSentence) {
      duration += baseDuration * 1.5;
    } else if (wordObj.hasPause) {
      duration += baseDuration * 0.5;
    }
  }

  return Math.round(duration);
}

/**
 * RSVP Reader class
 */
class RSVPReader {
  constructor(settings = {}) {
    this.settings = {
      wpm: 550,
      pauseOnPunctuation: true,
      adjustForWordLength: true,
      ...settings
    };
    this.words = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.timerId = null;
    this.startTime = null;
    this.onWordChange = null;
    this.onComplete = null;
    this.onProgress = null;
  }

  /**
   * Load text for reading
   * @param {string} text - Text to read
   */
  loadText(text) {
    this.words = parseTextToWords(text);
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
  }

  /**
   * Get total word count
   * @returns {number}
   */
  getWordCount() {
    return this.words.length;
  }

  /**
   * Start reading
   */
  start() {
    if (this.words.length === 0) return;

    this.isPlaying = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.showNextWord();
  }

  /**
   * Pause reading
   */
  pause() {
    this.isPaused = true;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Resume reading
   */
  resume() {
    if (!this.isPaused) return;

    this.isPaused = false;
    this.showNextWord();
  }

  /**
   * Toggle pause/resume
   * @returns {boolean} New paused state
   */
  togglePause() {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
    return this.isPaused;
  }

  /**
   * Stop reading
   */
  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Skip forward/backward
   * @param {number} count - Number of words to skip (negative for backward)
   */
  skip(count) {
    const wasPaused = this.isPaused;
    this.pause();

    this.currentIndex = Math.max(0, Math.min(this.words.length - 1, this.currentIndex + count));

    if (this.onWordChange) {
      this.onWordChange(this.words[this.currentIndex], this.currentIndex, this.words.length);
    }

    if (this.onProgress) {
      this.onProgress(this.currentIndex, this.words.length);
    }

    if (!wasPaused && this.isPlaying) {
      this.resume();
    }
  }

  /**
   * Change reading speed
   * @param {number} newWPM - New words per minute
   */
  changeSpeed(newWPM) {
    this.settings.wpm = Math.max(50, Math.min(1000, newWPM));
  }

  /**
   * Get current reading progress
   * @returns {Object} Progress information
   */
  getProgress() {
    return {
      current: this.currentIndex + 1,
      total: this.words.length,
      percentage: this.words.length > 0 ? ((this.currentIndex + 1) / this.words.length * 100) : 0
    };
  }

  /**
   * Get acceleration multiplier for ramp-up effect
   * @private
   * @returns {number} Multiplier (2 at start, 1 after 1 second)
   */
  getAccelerationMultiplier() {
    if (!this.startTime) return 1;

    const elapsed = Date.now() - this.startTime;
    const rampDuration = 1000; // 1 second ramp-up

    if (elapsed >= rampDuration) return 1;

    // Linear interpolation: starts at 2x duration (slower), ends at 1x
    return 2 - (elapsed / rampDuration);
  }

  /**
   * Show the next word
   * @private
   */
  showNextWord() {
    if (this.currentIndex >= this.words.length) {
      this.isPlaying = false;
      if (this.onComplete) {
        this.onComplete();
      }
      return;
    }

    const word = this.words[this.currentIndex];

    // Notify word change
    if (this.onWordChange) {
      this.onWordChange(word, this.currentIndex, this.words.length);
    }

    // Notify progress
    if (this.onProgress) {
      this.onProgress(this.currentIndex, this.words.length);
    }

    // Calculate duration with acceleration ramp-up
    let duration = getWordDuration(word, this.settings.wpm, this.settings);
    duration *= this.getAccelerationMultiplier();

    // Schedule next word
    this.currentIndex++;
    this.timerId = setTimeout(() => {
      if (!this.isPaused && this.isPlaying) {
        this.showNextWord();
      }
    }, duration);
  }
}

// Utility exports
const rsvpUtils = {
  getORPIndex,
  processWord,
  parseTextToWords,
  getWordDuration
};


  // Expose to global scope
  global.RSVPReader = RSVPReader;
  global.rsvpUtils = rsvpUtils;

})(typeof window !== 'undefined' ? window : this);
