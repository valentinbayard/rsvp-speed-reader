// Shared settings schema and defaults

export const DEFAULT_SETTINGS = {
  wpm: 550,
  countdownDuration: 3,
  pauseOnPunctuation: true,
  adjustForWordLength: true
};

export const SETTINGS_BOUNDS = {
  wpm: { min: 100, max: 1000, step: 25 },
  countdownDuration: { min: 0, max: 5, step: 1 }
};

/**
 * Validate and normalize settings
 * @param {Object} settings - Settings to validate
 * @returns {Object} Validated settings with defaults applied
 */
export function validateSettings(settings = {}) {
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
