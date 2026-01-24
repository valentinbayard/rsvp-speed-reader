// RSVP Speed Reader - API Client for Cloudflare Worker

/**
 * Extract article content from a URL using the Cloudflare Worker proxy
 * @param {string} url - Article URL to extract
 * @param {string} apiEndpoint - Cloudflare Worker endpoint
 * @returns {Promise<Object>} Extracted article data
 */
async function extractArticle(url, apiEndpoint) {
  if (!apiEndpoint) {
    throw new Error('API endpoint not configured. Please set it in Settings.');
  }

  // Validate URL
  try {
    new URL(url);
  } catch (e) {
    throw new Error('Invalid URL format');
  }

  // Build request URL
  const requestUrl = new URL('/api/extract', apiEndpoint);
  requestUrl.searchParams.set('url', url);

  // Fetch with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(requestUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: Failed to extract article`);
    }

    const data = await response.json();

    if (!data.content || data.content.length < 100) {
      throw new Error('Could not extract article content. Try pasting the text directly.');
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }

    throw error;
  }
}

/**
 * Clean article text by removing captions, credits, and noise
 * (Client-side fallback for when server doesn't clean text)
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
    if (/^(Photo|Illustration|Image|Figure|Fig\.|Cr\u00E9dit)\s*\d*/i.test(trimmed)) return false;

    // Skip "Agrandir l'image" and similar UI text
    if (/^(Agrandir|Zoom|Voir|Lire aussi|\u00C0 lire aussi|Sur le m\u00EAme sujet)/i.test(trimmed)) return false;

    // Skip lines that look like captions (short lines with copyright or credit keywords)
    if (trimmed.length < 150 && /(\u00A9|cr\u00E9dit|photo|AFP|Reuters|AP |Getty|NurPhoto)/i.test(trimmed)) return false;

    // Skip pull quotes that are repeated (often formatted differently)
    if (trimmed.length < 100 && /^[\u00AB"'].+[\u00BB"']$/.test(trimmed)) return false;

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

// Export
window.ArticleAPI = {
  extractArticle,
  cleanArticleText,
  extractUrlFromText
};
