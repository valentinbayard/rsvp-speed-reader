// Storage utilities for RSVP Reader settings

const DEFAULT_SETTINGS = {
  wpm: 550,
  pauseOnPunctuation: true,
  adjustForWordLength: true,
  countdownDuration: 3  // secondes
};

/**
 * Load settings from Chrome storage
 * @returns {Promise<Object>} Settings object
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('rsvpSettings', (data) => {
      const settings = { ...DEFAULT_SETTINGS, ...data.rsvpSettings };
      resolve(settings);
    });
  });
}

/**
 * Save settings to Chrome storage
 * @param {Object} settings - Settings object to save
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ rsvpSettings: settings }, () => {
      resolve();
    });
  });
}

/**
 * Get a specific setting value
 * @param {string} key - Setting key
 * @returns {Promise<any>} Setting value
 */
async function getSetting(key) {
  const settings = await loadSettings();
  return settings[key];
}

/**
 * Update a specific setting
 * @param {string} key - Setting key
 * @param {any} value - New value
 * @returns {Promise<void>}
 */
async function updateSetting(key, value) {
  const settings = await loadSettings();
  settings[key] = value;
  await saveSettings(settings);
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadSettings, saveSettings, getSetting, updateSetting, DEFAULT_SETTINGS };
}
