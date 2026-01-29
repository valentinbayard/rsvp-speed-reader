// RSVP Speed Reader - OCR Module
// Client-side OCR using Tesseract.js

(function() {
  'use strict';

  // State
  let tesseractWorker = null;
  let isProcessing = false;
  let currentAbortController = null;

  // Configuration
  const OCR_CONFIG = {
    languages: 'fra+eng',
    maxImageDimension: 2000,
    minConfidence: 60
  };

  /**
   * Load Tesseract.js library dynamically
   */
  async function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load OCR library'));
      document.head.appendChild(script);
    });
  }

  /**
   * Initialize Tesseract worker (lazy load)
   */
  async function initWorker(onProgress) {
    await loadTesseract();

    if (tesseractWorker) return tesseractWorker;

    const { createWorker } = Tesseract;

    tesseractWorker = await createWorker(OCR_CONFIG.languages, 1, {
      logger: progress => {
        if (onProgress) {
          onProgress(formatProgress(progress));
        }
      }
    });

    return tesseractWorker;
  }

  /**
   * Format Tesseract progress for UI
   */
  function formatProgress(progress) {
    const statusMap = {
      'loading tesseract core': 'Chargement du moteur OCR...',
      'initializing tesseract': 'Initialisation...',
      'loading language traineddata': 'Chargement des données linguistiques...',
      'initialized api': 'Préparation...',
      'recognizing text': 'Reconnaissance du texte...'
    };

    return {
      status: statusMap[progress.status] || progress.status || 'Traitement...',
      progress: progress.progress || 0
    };
  }

  /**
   * Preprocess image for better OCR results
   */
  async function preprocessImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate dimensions (max 2000px)
        const maxDim = OCR_CONFIG.maxImageDimension;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        canvas.width = width;
        canvas.height = height;

        // Apply slight contrast boost for better OCR
        ctx.filter = 'contrast(1.15)';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Échec du traitement de l\'image'));
          }
        }, 'image/png', 0.95);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Impossible de charger l\'image'));
      };

      img.src = url;
    });
  }

  /**
   * Perform OCR on an image
   * @param {File|Blob} imageFile - Image to process
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} OCR result with text and confidence
   */
  async function recognizeText(imageFile, onProgress) {
    if (isProcessing) {
      throw new Error('OCR déjà en cours');
    }

    isProcessing = true;
    currentAbortController = new AbortController();

    try {
      // Initialize worker
      onProgress?.({ status: 'Préparation...', progress: 0 });
      const worker = await initWorker(onProgress);

      // Check for cancellation
      if (currentAbortController.signal.aborted) {
        throw new Error('Cancelled');
      }

      // Preprocess image
      onProgress?.({ status: 'Optimisation de l\'image...', progress: 0.05 });
      const processedImage = await preprocessImage(imageFile);

      // Check for cancellation
      if (currentAbortController.signal.aborted) {
        throw new Error('Cancelled');
      }

      // Perform OCR
      const result = await worker.recognize(processedImage);

      // Calculate average confidence
      const confidence = result.data.confidence;

      // Clean up OCR text (fix common issues)
      let text = result.data.text.trim();
      // Replace multiple spaces/newlines with single space
      text = text.replace(/\s+/g, ' ').trim();
      // Fix common OCR errors in French
      text = text.replace(/'/g, "'"); // Smart quote to apostrophe
      text = text.replace(/"/g, '"').replace(/"/g, '"'); // Smart quotes

      return {
        text: text,
        confidence: confidence,
        wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
        isLowConfidence: confidence < OCR_CONFIG.minConfidence
      };

    } finally {
      isProcessing = false;
      currentAbortController = null;
    }
  }

  /**
   * Cancel ongoing OCR operation
   */
  function cancelOCR() {
    if (currentAbortController) {
      currentAbortController.abort();
    }
  }

  /**
   * Terminate worker (cleanup)
   */
  async function terminate() {
    if (tesseractWorker) {
      await tesseractWorker.terminate();
      tesseractWorker = null;
    }
  }

  /**
   * Check if OCR is available (will be loaded on demand)
   */
  function isSupported() {
    // Check for required APIs
    return typeof Blob !== 'undefined' &&
           typeof Image !== 'undefined' &&
           typeof HTMLCanvasElement !== 'undefined';
  }

  // Export
  window.OCRModule = {
    recognizeText,
    cancelOCR,
    terminate,
    isSupported,
    loadTesseract,
    isProcessing: () => isProcessing
  };

})();
