// RSVP Speed Reader - API Client for Cloudflare Worker
// Text utilities are loaded from shared/text-utils.browser.js (TextUtils global)

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
  if (!TextUtils.isValidUrl(url)) {
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

// Export - use shared TextUtils for text cleaning
window.ArticleAPI = {
  extractArticle,
  cleanArticleText: TextUtils.cleanArticleText,
  extractUrlFromText: TextUtils.extractUrlFromText
};
