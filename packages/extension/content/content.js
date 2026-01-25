// RSVP Reader - Content Script

(function() {
  'use strict';

  // State
  let isReading = false;
  let reader = null;
  let settings = {};

  // DOM elements
  let readerOverlay = null;

  /**
   * Extract article content using Readability
   */
  function extractArticle() {
    try {
      const documentClone = document.cloneNode(true);
      const readability = new Readability(documentClone);
      return readability.parse();
    } catch (error) {
      console.error('Readability error:', error);
      return null;
    }
  }

  /**
   * Clean extracted text by removing captions, credits, and noise
   */
  function cleanArticleText(text) {
    if (!text) return text;

    // Split into lines for filtering
    const lines = text.split('\n');

    const cleanedLines = lines.filter(line => {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) return false;

      // Skip photo credits (starts with ©)
      if (trimmed.startsWith('©') || trimmed.startsWith('(c)')) return false;

      // Skip "Photo X" or "Illustration X" patterns
      if (/^(Photo|Illustration|Image|Figure|Fig\.|Crédit)\s*\d*/i.test(trimmed)) return false;

      // Skip "Agrandir l'image" and similar UI text
      if (/^(Agrandir|Zoom|Voir|Lire aussi|À lire aussi|Sur le même sujet)/i.test(trimmed)) return false;

      // Skip lines that look like captions (short lines with © or credit keywords)
      if (trimmed.length < 150 && /(©|crédit|photo|AFP|Reuters|AP |Getty|NurPhoto)/i.test(trimmed)) return false;

      // Skip pull quotes that are repeated (often formatted differently)
      // These are usually short and in quotes
      if (trimmed.length < 100 && /^[«"'].+[»"']$/.test(trimmed)) return false;

      return true;
    });

    // Join and clean up multiple spaces/newlines
    return cleanedLines
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Show error message when no article is detected
   */
  function showNoArticleMessage() {
    const message = document.createElement('div');
    message.className = 'rsvp-message rsvp-fade-in';
    message.innerHTML = `
      <div class="rsvp-message-content">
        <div class="rsvp-message-icon">📄</div>
        <div class="rsvp-message-title">Pas d'article détecté</div>
        <div class="rsvp-message-text">Sélectionnez du texte sur la page et réessayez.</div>
      </div>
    `;

    document.body.appendChild(message);

    // Auto-dismiss after 3 seconds or on click
    const dismiss = () => {
      message.classList.add('rsvp-fade-out');
      setTimeout(() => {
        if (message.parentNode) {
          message.parentNode.removeChild(message);
        }
      }, 300);
    };

    message.addEventListener('click', dismiss);
    setTimeout(dismiss, 3000);
  }

  /**
   * Start reading text (fullscreen overlay)
   */
  function startReadingText(text) {
    if (isReading || !text.trim()) return;

    isReading = true;

    // Create reader
    reader = new RSVPReader(settings);
    reader.loadText(text.trim());

    // Create fullscreen overlay
    createFullscreenOverlay();

    // Set up callbacks
    reader.onWordChange = displayWord;
    reader.onProgress = updateProgress;
    reader.onComplete = handleReadingComplete;

    // Start countdown then read
    startCountdown();
  }

  /**
   * Start countdown before reading
   */
  function startCountdown() {
    const duration = settings.countdownDuration || 0;
    if (duration === 0) {
      reader.start();
      return;
    }

    let count = duration;
    const wordDisplay = readerOverlay.querySelector('.rsvp-word-display');
    wordDisplay.innerHTML = `<span class="orp">${count}</span>`;
    wordDisplay.style.transform = 'translateX(0)';

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        wordDisplay.innerHTML = `<span class="orp">${count}</span>`;
      } else {
        clearInterval(interval);
        reader.start();
      }
    }, 1000);
  }

  /**
   * Create fullscreen overlay
   */
  function createFullscreenOverlay() {
    readerOverlay = document.createElement('div');
    readerOverlay.className = 'rsvp-reader-overlay rsvp-fullscreen rsvp-fade-in';

    readerOverlay.innerHTML = `
      <div class="rsvp-focal-line"></div>
      <div class="rsvp-word-container">
        <div class="rsvp-word-display"></div>
      </div>
      <div class="rsvp-controls">
        <div class="rsvp-progress">Mot <span class="rsvp-current">1</span> / <span class="rsvp-total">0</span></div>
        <div class="rsvp-speed"><span class="rsvp-wpm">${settings.wpm}</span> MPM</div>
      </div>
      <div class="rsvp-status">Lecture</div>
    `;

    document.body.appendChild(readerOverlay);
    document.addEventListener('keydown', handleReadingKeydown);
  }

  /**
   * Handle completion of reading
   */
  function handleReadingComplete() {
    stopReading();
  }

  /**
   * Display a word in the overlay
   */
  function displayWord(wordObj, index, total) {
    if (!readerOverlay) return;

    const wordDisplay = readerOverlay.querySelector('.rsvp-word-display');
    const before = wordObj.text.substring(0, wordObj.orpIndex);
    const orpChar = wordObj.text.charAt(wordObj.orpIndex);
    const after = wordObj.text.substring(wordObj.orpIndex + 1);

    // Calculate offset using character counts (monospace font)
    // Using 'ch' unit = width of one character in monospace
    const totalChars = wordObj.text.length + wordObj.punctuation.length;
    const beforeChars = before.length;
    // Offset to shift ORP center to container center
    const offsetCh = totalChars / 2 - beforeChars - 0.5;

    wordDisplay.style.transform = `translateX(${offsetCh}ch)`;
    wordDisplay.innerHTML = `
      <span class="before">${before}</span><span class="orp">${orpChar}</span><span class="after">${after}</span><span class="punctuation">${wordObj.punctuation}</span>
    `;
  }

  /**
   * Update progress display
   */
  function updateProgress(current, total) {
    if (!readerOverlay) return;

    const currentEl = readerOverlay.querySelector('.rsvp-current');
    const totalEl = readerOverlay.querySelector('.rsvp-total');

    if (currentEl) currentEl.textContent = current + 1;
    if (totalEl) totalEl.textContent = total;
  }

  /**
   * Stop reading
   */
  function stopReading() {
    if (!isReading) return;

    isReading = false;

    if (reader) {
      reader.stop();
      reader = null;
    }

    // Remove overlay
    if (readerOverlay) {
      readerOverlay.classList.add('rsvp-fade-out');
      setTimeout(() => {
        if (readerOverlay && readerOverlay.parentNode) {
          readerOverlay.parentNode.removeChild(readerOverlay);
        }
        readerOverlay = null;
      }, 300);
    }

    document.removeEventListener('keydown', handleReadingKeydown);
  }

  /**
   * Handle keyboard during reading
   */
  function handleReadingKeydown(event) {
    if (!reader) return;

    switch (event.key) {
      case ' ':
        event.preventDefault();
        if (reader.isPaused) {
          reader.resume();
          updateStatus('Lecture');
        } else {
          reader.pause();
          updateStatus('Pause', true);
        }
        break;

      case 'Escape':
        event.preventDefault();
        stopReading();
        break;

      case 'ArrowLeft':
        event.preventDefault();
        reader.skip(-5);
        break;

      case 'ArrowRight':
        event.preventDefault();
        reader.skip(5);
        break;

      case 'ArrowUp':
        event.preventDefault();
        reader.changeSpeed(reader.settings.wpm + 25);
        updateSpeed();
        break;

      case 'ArrowDown':
        event.preventDefault();
        reader.changeSpeed(reader.settings.wpm - 25);
        updateSpeed();
        break;
    }
  }

  /**
   * Update status indicator
   */
  function updateStatus(text, isPaused = false) {
    if (!readerOverlay) return;
    const status = readerOverlay.querySelector('.rsvp-status');
    if (status) {
      status.textContent = text;
      status.classList.toggle('paused', isPaused);
    }
  }

  /**
   * Update speed display
   */
  function updateSpeed() {
    if (!readerOverlay || !reader) return;
    const wpmEl = readerOverlay.querySelector('.rsvp-wpm');
    if (wpmEl) {
      wpmEl.textContent = reader.settings.wpm;
    }
  }

  /**
   * Load settings and initialize
   */
  async function init() {
    // Load settings from storage
    try {
      const stored = await chrome.storage.sync.get('rsvpSettings');
      settings = {
        wpm: 550,
        pauseOnPunctuation: true,
        adjustForWordLength: true,
        countdownDuration: 3,
        ...stored.rsvpSettings
      };
    } catch (error) {
      console.error('Failed to load settings:', error);
      settings = {
        wpm: 550,
        pauseOnPunctuation: true,
        adjustForWordLength: true,
        countdownDuration: 3
      };
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'activate-selection-mode') {
      // Check if text is selected first
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString().trim() : '';

      if (selectedText.length > 0) {
        // Start reading selected text (also clean it)
        startReadingText(cleanArticleText(selectedText));
      } else {
        // Try to extract article with Readability
        const article = extractArticle();
        if (article && article.textContent) {
          const cleanedText = cleanArticleText(article.textContent);
          if (cleanedText.length > 500) {
            startReadingText(cleanedText);
          } else {
            showNoArticleMessage();
          }
        } else {
          // No article detected
          showNoArticleMessage();
        }
      }
      sendResponse({ success: true });
    } else if (message.action === 'update-settings') {
      settings = { ...settings, ...message.settings };
      sendResponse({ success: true });
    }
  });

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
