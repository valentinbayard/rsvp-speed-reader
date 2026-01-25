// RSVP Speed Reader - Main Application

(function() {
  'use strict';

  // State
  let reader = null;
  let settings = {};
  let deferredInstallPrompt = null;

  // Reading session tracking
  let sessionStats = {
    startTime: null,
    endTime: null,
    pauseStartTime: null,
    totalPauseTime: 0,
    pauseCount: 0,
    wordCount: 0
  };

  // DOM Elements
  const screens = {
    app: document.getElementById('app'),
    settings: document.getElementById('settings'),
    reader: document.getElementById('reader')
  };

  const elements = {
    // App screen
    urlInput: document.getElementById('url-input'),
    textInput: document.getElementById('text-input'),
    readUrlBtn: document.getElementById('read-url-btn'),
    readTextBtn: document.getElementById('read-text-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorText: document.getElementById('error-text'),
    errorDismiss: document.getElementById('error-dismiss'),

    // Install prompt
    installPrompt: document.getElementById('install-prompt'),
    installBtn: document.getElementById('install-btn'),
    installDismiss: document.getElementById('install-dismiss'),

    // Settings screen
    settingsBack: document.getElementById('settings-back'),
    speedSlider: document.getElementById('speed-slider'),
    speedValue: document.getElementById('speed-value'),
    countdownSlider: document.getElementById('countdown-slider'),
    countdownValue: document.getElementById('countdown-value'),
    pausePunctuation: document.getElementById('pause-punctuation'),
    adjustLength: document.getElementById('adjust-length'),
    apiEndpoint: document.getElementById('api-endpoint'),

    // Reader screen
    wordDisplay: document.getElementById('word-display'),
    currentWord: document.getElementById('current-word'),
    totalWords: document.getElementById('total-words'),
    currentSpeed: document.getElementById('current-speed'),
    readerStatus: document.getElementById('reader-status'),
    readerClose: document.getElementById('reader-close'),
    touchHint: document.getElementById('touch-hint'),

    // Recap
    readingRecap: document.getElementById('reading-recap'),
    recapWords: document.getElementById('recap-words'),
    recapTime: document.getElementById('recap-time'),
    recapTimeLabel: document.getElementById('recap-time-label'),
    recapWpm: document.getElementById('recap-wpm'),
    recapWpmLabel: document.getElementById('recap-wpm-label'),
    recapClose: document.getElementById('recap-close')
  };

  // Touch handling
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  /**
   * Initialize the application
   */
  function init() {
    // Load settings
    settings = SettingsManager.getSettings();
    applySettingsToUI();

    // Check for shared content in URL
    handleSharedContent();

    // Set up event listeners
    setupEventListeners();

    // Register service worker
    registerServiceWorker();

    // Handle install prompt
    setupInstallPrompt();
  }

  /**
   * Handle shared content from Web Share Target
   */
  function handleSharedContent() {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url');
    const sharedText = params.get('text');

    if (sharedUrl) {
      elements.urlInput.value = sharedUrl;
      // Clear the URL params
      window.history.replaceState({}, '', '/');
      // Auto-start reading
      handleReadUrl();
    } else if (sharedText) {
      // Check if the text contains a URL
      const extractedUrl = ArticleAPI.extractUrlFromText(sharedText);
      if (extractedUrl) {
        elements.urlInput.value = extractedUrl;
        window.history.replaceState({}, '', '/');
        handleReadUrl();
      } else {
        elements.textInput.value = sharedText;
        window.history.replaceState({}, '', '/');
      }
    }
  }

  /**
   * Set up all event listeners
   */
  function setupEventListeners() {
    // App screen
    elements.readUrlBtn.addEventListener('click', handleReadUrl);
    elements.readTextBtn.addEventListener('click', handleReadText);
    elements.settingsBtn.addEventListener('click', () => showScreen('settings'));
    elements.errorDismiss.addEventListener('click', hideError);

    // Enter key on URL input
    elements.urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleReadUrl();
    });

    // Settings screen
    elements.settingsBack.addEventListener('click', () => showScreen('app'));
    elements.speedSlider.addEventListener('input', handleSpeedChange);
    elements.countdownSlider.addEventListener('input', handleCountdownChange);
    elements.pausePunctuation.addEventListener('change', handleToggleChange);
    elements.adjustLength.addEventListener('change', handleToggleChange);
    elements.apiEndpoint.addEventListener('change', handleApiEndpointChange);

    // Reader screen
    elements.readerClose.addEventListener('click', stopReading);
    elements.recapClose.addEventListener('click', closeRecap);

    // Touch controls for reader
    screens.reader.addEventListener('touchstart', handleTouchStart, { passive: true });
    screens.reader.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Keyboard controls
    document.addEventListener('keydown', handleKeydown);

    // Install prompt
    elements.installBtn.addEventListener('click', handleInstall);
    elements.installDismiss.addEventListener('click', () => {
      elements.installPrompt.classList.add('hidden');
      localStorage.setItem('iosInstallDismissed', 'true');
    });
  }

  /**
   * Show a specific screen
   */
  function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
  }

  /**
   * Show loading state
   */
  function showLoading() {
    elements.loading.classList.remove('hidden');
    elements.error.classList.add('hidden');
  }

  /**
   * Hide loading state
   */
  function hideLoading() {
    elements.loading.classList.add('hidden');
  }

  /**
   * Show error message
   */
  function showError(message) {
    elements.errorText.textContent = message;
    elements.error.classList.remove('hidden');
    elements.loading.classList.add('hidden');
  }

  /**
   * Hide error message
   */
  function hideError() {
    elements.error.classList.add('hidden');
  }

  /**
   * Handle reading from URL
   */
  async function handleReadUrl() {
    const url = elements.urlInput.value.trim();
    if (!url) {
      showError('Veuillez entrer une URL');
      return;
    }

    // Check if API endpoint is configured
    if (!settings.apiEndpoint) {
      showError('API endpoint non configuré. Configurez-le dans les paramètres ou collez le texte directement.');
      return;
    }

    showLoading();

    try {
      const article = await ArticleAPI.extractArticle(url, settings.apiEndpoint);
      const cleanedText = ArticleAPI.cleanArticleText(article.content);

      if (cleanedText.length < 100) {
        throw new Error('Article trop court ou non détecté');
      }

      hideLoading();
      startReading(cleanedText);
    } catch (error) {
      showError(error.message || 'Erreur lors de l\'extraction de l\'article');
    }
  }

  /**
   * Handle reading pasted text
   */
  function handleReadText() {
    const text = elements.textInput.value.trim();
    if (!text) {
      showError('Veuillez coller du texte');
      return;
    }

    if (text.length < 50) {
      showError('Le texte est trop court');
      return;
    }

    const cleanedText = ArticleAPI.cleanArticleText(text);
    startReading(cleanedText);
  }

  /**
   * Start the RSVP reader
   */
  function startReading(text) {
    // Create reader instance
    reader = new RSVPReader({
      wpm: settings.wpm,
      pauseOnPunctuation: settings.pauseOnPunctuation,
      adjustForWordLength: settings.adjustForWordLength
    });

    reader.loadText(text);

    // Reset session stats
    sessionStats = {
      startTime: null,
      endTime: null,
      pauseStartTime: null,
      totalPauseTime: 0,
      pauseCount: 0,
      wordCount: reader.getWordCount()
    };

    // Set up callbacks
    reader.onWordChange = displayWord;
    reader.onProgress = updateProgress;
    reader.onComplete = handleReadingComplete;

    // Update UI
    elements.totalWords.textContent = reader.getWordCount();
    elements.currentSpeed.textContent = settings.wpm;
    updateStatus('Lecture');

    // Show reader screen
    showScreen('reader');

    // Show touch hint if first time
    if (!settings.hasSeenTouchHint) {
      elements.touchHint.classList.remove('hidden');
      setTimeout(() => {
        elements.touchHint.classList.add('hidden');
        SettingsManager.setSetting('hasSeenTouchHint', true);
      }, 3000);
    }

    // Start countdown then read
    startCountdown();
  }

  /**
   * Start countdown before reading
   */
  function startCountdown() {
    const duration = settings.countdownDuration || 0;

    if (duration === 0) {
      sessionStats.startTime = Date.now();
      reader.start();
      return;
    }

    let count = duration;
    elements.wordDisplay.innerHTML = `<span class="orp">${count}</span>`;
    elements.wordDisplay.style.transform = 'translateX(0)';

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        elements.wordDisplay.innerHTML = `<span class="orp">${count}</span>`;
      } else {
        clearInterval(interval);
        sessionStats.startTime = Date.now();
        reader.start();
      }
    }, 1000);
  }

  /**
   * Display a word in the reader
   */
  function displayWord(wordObj, index, total) {
    const before = wordObj.text.substring(0, wordObj.orpIndex);
    const orpChar = wordObj.text.charAt(wordObj.orpIndex);
    const after = wordObj.text.substring(wordObj.orpIndex + 1);

    // Calculate offset using character counts (monospace font)
    const totalChars = wordObj.text.length + wordObj.punctuation.length;
    const beforeChars = before.length;
    const offsetCh = totalChars / 2 - beforeChars - 0.5;

    elements.wordDisplay.style.transform = `translateX(${offsetCh}ch)`;
    elements.wordDisplay.innerHTML = `
      <span class="before">${before}</span><span class="orp">${orpChar}</span><span class="after">${after}</span><span class="punctuation">${wordObj.punctuation}</span>
    `;
  }

  /**
   * Update progress display
   */
  function updateProgress(current, total) {
    elements.currentWord.textContent = current + 1;
  }

  /**
   * Update status indicator
   */
  function updateStatus(text, isPaused = false) {
    elements.readerStatus.textContent = text;
    elements.readerStatus.classList.toggle('paused', isPaused);
  }

  /**
   * Toggle pause and track pause time
   */
  function togglePauseWithTracking() {
    const isPaused = reader.togglePause();

    if (isPaused) {
      // Starting a pause
      sessionStats.pauseStartTime = Date.now();
      sessionStats.pauseCount++;
    } else {
      // Ending a pause
      if (sessionStats.pauseStartTime) {
        sessionStats.totalPauseTime += Date.now() - sessionStats.pauseStartTime;
        sessionStats.pauseStartTime = null;
      }
    }

    updateStatus(isPaused ? 'Pause' : 'Lecture', isPaused);
    return isPaused;
  }

  /**
   * Handle reading completion
   */
  function handleReadingComplete() {
    sessionStats.endTime = Date.now();

    // If paused when finishing, add that pause time
    if (sessionStats.pauseStartTime) {
      sessionStats.totalPauseTime += Date.now() - sessionStats.pauseStartTime;
      sessionStats.pauseStartTime = null;
    }

    updateStatus('Terminé');
    setTimeout(showRecap, 500);
  }

  /**
   * Format duration in seconds to mm:ss or ss
   */
  function formatDuration(seconds) {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Show reading recap
   */
  function showRecap() {
    const totalTimeMs = sessionStats.endTime - sessionStats.startTime;
    const readingTimeMs = totalTimeMs - sessionStats.totalPauseTime;

    const totalTimeSec = totalTimeMs / 1000;
    const readingTimeSec = readingTimeMs / 1000;

    const readingWpm = Math.round(sessionStats.wordCount / (readingTimeSec / 60));
    const totalWpm = Math.round(sessionStats.wordCount / (totalTimeSec / 60));

    const hadPauses = sessionStats.pauseCount > 0;

    // Update recap display
    elements.recapWords.textContent = sessionStats.wordCount.toLocaleString('fr-FR');

    if (hadPauses) {
      elements.recapTime.textContent = formatDuration(readingTimeSec);
      elements.recapTimeLabel.innerHTML = `temps de lecture<br><span class="recap-pause-info">(${formatDuration(totalTimeSec)} avec pauses)</span>`;

      elements.recapWpm.textContent = readingWpm;
      elements.recapWpmLabel.innerHTML = `mots/min<br><span class="recap-pause-info">(${totalWpm} avec pauses)</span>`;
    } else {
      elements.recapTime.textContent = formatDuration(readingTimeSec);
      elements.recapTimeLabel.textContent = 'temps de lecture';

      elements.recapWpm.textContent = readingWpm;
      elements.recapWpmLabel.textContent = 'mots/min';
    }

    elements.readingRecap.classList.remove('hidden');
  }

  /**
   * Close recap and return to app
   */
  function closeRecap() {
    elements.readingRecap.classList.add('hidden');
    stopReading();
  }

  /**
   * Stop reading and return to app
   */
  function stopReading() {
    if (reader) {
      reader.stop();
      reader = null;
    }
    showScreen('app');
  }

  /**
   * Handle touch start
   */
  function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }

  /**
   * Handle touch end (detect taps and swipes)
   */
  function handleTouchEnd(e) {
    if (!reader) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const touchDuration = Date.now() - touchStartTime;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Tap (short duration, minimal movement)
    if (touchDuration < 300 && absDeltaX < 30 && absDeltaY < 30) {
      // Don't toggle if tapping the close button
      if (e.target.closest('.reader-close')) return;

      togglePauseWithTracking();
      return;
    }

    // Swipe detection (minimum 50px movement)
    const minSwipeDistance = 50;

    if (absDeltaX > absDeltaY && absDeltaX > minSwipeDistance) {
      // Horizontal swipe
      if (deltaX > 0) {
        // Swipe right - skip forward
        reader.skip(5);
      } else {
        // Swipe left - skip backward
        reader.skip(-5);
      }
    } else if (absDeltaY > absDeltaX && absDeltaY > minSwipeDistance) {
      // Vertical swipe
      if (deltaY < 0) {
        // Swipe up - increase speed
        reader.changeSpeed(reader.settings.wpm + 50);
        elements.currentSpeed.textContent = reader.settings.wpm;
      } else {
        // Swipe down - decrease speed
        reader.changeSpeed(reader.settings.wpm - 50);
        elements.currentSpeed.textContent = reader.settings.wpm;
      }
    }
  }

  /**
   * Handle keyboard events
   */
  function handleKeydown(e) {
    // Only handle when reader is active
    if (!screens.reader.classList.contains('active') || !reader) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePauseWithTracking();
        break;

      case 'Escape':
        e.preventDefault();
        stopReading();
        break;

      case 'ArrowLeft':
        e.preventDefault();
        reader.skip(-5);
        break;

      case 'ArrowRight':
        e.preventDefault();
        reader.skip(5);
        break;

      case 'ArrowUp':
        e.preventDefault();
        reader.changeSpeed(reader.settings.wpm + 25);
        elements.currentSpeed.textContent = reader.settings.wpm;
        break;

      case 'ArrowDown':
        e.preventDefault();
        reader.changeSpeed(reader.settings.wpm - 25);
        elements.currentSpeed.textContent = reader.settings.wpm;
        break;
    }
  }

  /**
   * Apply settings to UI elements
   */
  function applySettingsToUI() {
    elements.speedSlider.value = settings.wpm;
    elements.speedValue.textContent = `${settings.wpm} MPM`;

    elements.countdownSlider.value = settings.countdownDuration;
    elements.countdownValue.textContent = `${settings.countdownDuration}s`;

    elements.pausePunctuation.checked = settings.pauseOnPunctuation;
    elements.adjustLength.checked = settings.adjustForWordLength;
    elements.apiEndpoint.value = settings.apiEndpoint || '';
  }

  /**
   * Handle speed slider change
   */
  function handleSpeedChange(e) {
    const wpm = parseInt(e.target.value, 10);
    elements.speedValue.textContent = `${wpm} MPM`;
    settings.wpm = wpm;
    SettingsManager.saveSettings(settings);
  }

  /**
   * Handle countdown slider change
   */
  function handleCountdownChange(e) {
    const countdown = parseInt(e.target.value, 10);
    elements.countdownValue.textContent = `${countdown}s`;
    settings.countdownDuration = countdown;
    SettingsManager.saveSettings(settings);
  }

  /**
   * Handle toggle changes
   */
  function handleToggleChange(e) {
    const setting = e.target.id === 'pause-punctuation' ? 'pauseOnPunctuation' : 'adjustForWordLength';
    settings[setting] = e.target.checked;
    SettingsManager.saveSettings(settings);
  }

  /**
   * Handle API endpoint change
   */
  function handleApiEndpointChange(e) {
    settings.apiEndpoint = e.target.value.trim();
    SettingsManager.saveSettings(settings);
  }

  /**
   * Register service worker
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('SW registered:', registration.scope);
        })
        .catch(error => {
          console.error('SW registration failed:', error);
        });
    }
  }

  /**
   * Detect iOS Safari
   */
  function isIOSSafari() {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
    return isIOS && isSafari;
  }

  /**
   * Check if running as installed PWA
   */
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  /**
   * Set up install prompt
   */
  function setupInstallPrompt() {
    // Don't show if already installed
    if (isStandalone()) return;

    // Android/Chrome: use native install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      elements.installPrompt.classList.remove('hidden');
    });

    window.addEventListener('appinstalled', () => {
      elements.installPrompt.classList.add('hidden');
      deferredInstallPrompt = null;
    });

    // iOS Safari: show manual instructions after a delay
    if (isIOSSafari() && !localStorage.getItem('iosInstallDismissed')) {
      setTimeout(() => {
        const prompt = elements.installPrompt;
        prompt.querySelector('p').innerHTML = 'Installer: appuyez sur <strong>Partager</strong> puis <strong>Sur l\'écran d\'accueil</strong>';
        prompt.querySelector('#install-btn').style.display = 'none';
        prompt.classList.remove('hidden');
      }, 3000);
    }
  }

  /**
   * Handle install button click
   */
  async function handleInstall() {
    if (!deferredInstallPrompt) return;

    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;

    if (outcome === 'accepted') {
      elements.installPrompt.classList.add('hidden');
    }

    deferredInstallPrompt = null;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
