// RSVP Reader - Popup Script

// Default settings
const DEFAULT_SETTINGS = {
  wpm: 550,
  pauseOnPunctuation: true,
  adjustForWordLength: true,
  countdownDuration: 3
};

// DOM elements
const activateBtn = document.getElementById('activateBtn');
const wpmSlider = document.getElementById('wpmSlider');
const wpmValue = document.getElementById('wpmValue');
const countdownSelect = document.getElementById('countdownSelect');
const pauseOnPunctuation = document.getElementById('pauseOnPunctuation');
const adjustForWordLength = document.getElementById('adjustForWordLength');
const saveStatus = document.getElementById('saveStatus');

let currentSettings = { ...DEFAULT_SETTINGS };

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('rsvpSettings');
    currentSettings = { ...DEFAULT_SETTINGS, ...result.rsvpSettings };
    updateUI();
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Erreur de chargement', 'error');
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    await chrome.storage.sync.set({ rsvpSettings: currentSettings });

    // Notify content script of settings change
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'update-settings',
          settings: currentSettings
        });
      }
    } catch (error) {
      // Content script might not be loaded yet, that's okay
      console.log('Content script not ready:', error);
    }

    showStatus('Paramètres sauvegardés', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Erreur de sauvegarde', 'error');
  }
}

/**
 * Update UI with current settings
 */
function updateUI() {
  wpmSlider.value = currentSettings.wpm;
  wpmValue.textContent = currentSettings.wpm;
  countdownSelect.value = currentSettings.countdownDuration;
  pauseOnPunctuation.checked = currentSettings.pauseOnPunctuation;
  adjustForWordLength.checked = currentSettings.adjustForWordLength;
}

/**
 * Show status message
 */
function showStatus(message, type = '') {
  saveStatus.textContent = message;
  saveStatus.className = 'save-status ' + type;

  if (message) {
    setTimeout(() => {
      saveStatus.textContent = '';
      saveStatus.className = 'save-status';
    }, 3000);
  }
}

/**
 * Handle activate button click
 */
async function handleActivate() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      showStatus('Aucun onglet actif', 'error');
      return;
    }

    // Send message to content script
    await chrome.tabs.sendMessage(tab.id, {
      action: 'activate-selection-mode'
    });

    // Close popup
    window.close();
  } catch (error) {
    console.error('Failed to activate:', error);
    showStatus('Erreur d\'activation', 'error');
  }
}

/**
 * Handle WPM slider change
 */
function handleWPMChange() {
  currentSettings.wpm = parseInt(wpmSlider.value);
  wpmValue.textContent = currentSettings.wpm;
  saveSettings();
}

/**
 * Handle countdown select change
 */
function handleCountdownChange() {
  currentSettings.countdownDuration = parseInt(countdownSelect.value);
  saveSettings();
}

/**
 * Handle pause on punctuation toggle
 */
function handlePauseOnPunctuationChange() {
  currentSettings.pauseOnPunctuation = pauseOnPunctuation.checked;
  saveSettings();
}

/**
 * Handle adjust for word length toggle
 */
function handleAdjustForWordLengthChange() {
  currentSettings.adjustForWordLength = adjustForWordLength.checked;
  saveSettings();
}

// Event listeners
activateBtn.addEventListener('click', handleActivate);
wpmSlider.addEventListener('input', () => {
  wpmValue.textContent = wpmSlider.value;
});
wpmSlider.addEventListener('change', handleWPMChange);
countdownSelect.addEventListener('change', handleCountdownChange);
pauseOnPunctuation.addEventListener('change', handlePauseOnPunctuationChange);
adjustForWordLength.addEventListener('change', handleAdjustForWordLengthChange);

// Initialize
loadSettings();
