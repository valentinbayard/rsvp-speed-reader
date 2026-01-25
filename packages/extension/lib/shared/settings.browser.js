// Settings - Browser bundle (auto-generated)

(function(global) {
  'use strict';

// Shared settings schema and defaults

const DEFAULT_SETTINGS = {
  wpm: 550,
  countdownDuration: 3,
  pauseOnPunctuation: true,
  adjustForWordLength: true
};

const SETTINGS_BOUNDS = {
  wpm: { min: 100, max: 1000, step: 25 },
  countdownDuration: { min: 0, max: 5, step: 1 }
};

/**
 * Validate and normalize settings
 * @param {Object} settings - Settings to validate
 * @returns {Object} Validated settings with defaults applied
 */
function validateSettings(settings = {}) {
  return {
    wpm: Math.max(
      SETTINGS_BOUNDS.wpm.min,
      Math.min(SETTINGS_BOUNDS.wpm.max, settings.wpm ?? DEFAULT_SETTINGS.wpm)
    ),
    countdownDuration: Math.max(
      SETTINGS_BOUNDS.countdownDuration.min,
      Math.min(SETTINGS_BOUNDS.countdownDuration.max, settings.countdownDuration ?? DEFAULT_SETTINGS.countdownDuration)
    ),
    pauseOnPunctuation: settings.pauseOnPunctuation ?? DEFAULT_SETTINGS.pauseOnPunctuation,
    adjustForWordLength: settings.adjustForWordLength ?? DEFAULT_SETTINGS.adjustForWordLength
  };
}


  // Expose to global scope
  global.RSVPSettings = {
    DEFAULT_SETTINGS,
    SETTINGS_BOUNDS,
    validateSettings
  };

})(typeof window !== 'undefined' ? window : this);
