// RSVP Speed Reader - LocalStorage Settings Manager

const STORAGE_KEY = 'rsvp-reader-settings';

const DEFAULT_SETTINGS = {
  wpm: 550,
  countdownDuration: 3,
  pauseOnPunctuation: true,
  adjustForWordLength: true,
  apiEndpoint: '',
  hasSeenTouchHint: false
};

/**
 * Get all settings
 * @returns {Object} Current settings
 */
function getSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings
 * @param {Object} settings - Settings to save
 */
function saveSettings(settings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to save settings:', e);
    return settings;
  }
}

/**
 * Get a single setting value
 * @param {string} key - Setting key
 * @returns {*} Setting value
 */
function getSetting(key) {
  const settings = getSettings();
  return settings[key];
}

/**
 * Set a single setting value
 * @param {string} key - Setting key
 * @param {*} value - Setting value
 */
function setSetting(key, value) {
  saveSettings({ [key]: value });
}

/**
 * Reset all settings to defaults
 */
function resetSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
  } catch (e) {
    console.error('Failed to reset settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

// Export
window.SettingsManager = {
  getSettings,
  saveSettings,
  getSetting,
  setSetting,
  resetSettings,
  DEFAULT_SETTINGS
};
