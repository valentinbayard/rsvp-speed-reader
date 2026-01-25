// Text Utils - Browser bundle (auto-generated)

(function(global) {
  'use strict';

// Text utilities shared between extension and PWA

/**
 * Clean article text by removing captions, credits, and noise
 * @param {string} text - Raw article text
 * @returns {string} Cleaned text
 */
function cleanArticleText(text) {
  if (!text) return text;

  // Split into lines for filtering
  const lines = text.split('\n');

  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) return false;

    // Skip photo credits (starts with copyright)
    if (trimmed.startsWith('\u00A9') || trimmed.startsWith('(c)')) return false;

    // Skip "Photo X" or "Illustration X" patterns
    if (/^(Photo|Illustration|Image|Figure|Fig\.|Crédit)\s*\d*/i.test(trimmed)) return false;

    // Skip "Agrandir l'image" and similar UI text
    if (/^(Agrandir|Zoom|Voir|Lire aussi|À lire aussi|Sur le même sujet)/i.test(trimmed)) return false;

    // Skip lines that look like captions (short lines with copyright or credit keywords)
    if (trimmed.length < 150 && /(©|crédit|photo|AFP|Reuters|AP |Getty|NurPhoto)/i.test(trimmed)) return false;

    // Skip pull quotes that are repeated (often formatted differently)
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
 * Try to extract a URL from shared text
 * Sometimes apps share "Title - URL" or "URL\nDescription"
 * @param {string} text - Shared text that might contain a URL
 * @returns {string|null} Extracted URL or null
 */
function extractUrlFromText(text) {
  if (!text) return null;

  // Look for URLs in the text
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlPattern);

  if (matches && matches.length > 0) {
    // Return the first URL found
    return matches[0];
  }

  return null;
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}


  // Expose to global scope
  global.TextUtils = {
    cleanArticleText,
    extractUrlFromText,
    isValidUrl
  };

})(typeof window !== 'undefined' ? window : this);
