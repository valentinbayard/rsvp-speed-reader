// RSVP Reader - Background Service Worker

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('RSVP Speed Reader installed');

    // Set default settings if not already set
    chrome.storage.sync.get('rsvpSettings', (data) => {
      if (!data.rsvpSettings) {
        const defaultSettings = {
          wpm: 550,
          pauseOnPunctuation: true,
          adjustForWordLength: true,
          countdownDuration: 3
        };

        chrome.storage.sync.set({ rsvpSettings: defaultSettings }, () => {
          console.log('Default settings initialized');
        });
      }
    });
  } else if (details.reason === 'update') {
    console.log('RSVP Speed Reader updated to version', chrome.runtime.getManifest().version);
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'reading-started') {
    console.log('Reading started in tab', sender.tab?.id);
    sendResponse({ success: true });
  } else if (message.action === 'reading-finished') {
    console.log('Reading finished in tab', sender.tab?.id);
    sendResponse({ success: true });
  }

  return true; // Keep message channel open for async response
});

// Handle extension icon click (optional - popup is default)
chrome.action.onClicked.addListener((tab) => {
  // This won't fire if default_popup is set in manifest
  // But we keep it here for future extensibility
  console.log('Extension icon clicked for tab', tab.id);
});

console.log('RSVP Speed Reader background service worker loaded');
