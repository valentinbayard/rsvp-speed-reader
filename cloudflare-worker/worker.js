/**
 * RSVP Speed Reader - Cloudflare Worker Proxy
 *
 * This worker fetches articles from URLs and extracts readable content
 * using Mozilla's Readability library.
 *
 * Endpoints:
 *   GET /api/extract?url=<article-url>
 *
 * Response:
 *   {
 *     "title": "Article Title",
 *     "content": "Cleaned article text...",
 *     "wordCount": 1234,
 *     "source": "example.com",
 *     "excerpt": "First 200 chars..."
 *   }
 */

// Import Readability and DOM parser for Cloudflare Workers
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// Rate limiting (simple in-memory, resets on worker restart)
const rateLimitMap = new Map();
const RATE_LIMIT = 30; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

/**
 * Check rate limit for IP
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.timestamp > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, timestamp: now });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

/**
 * Clean extracted text
 */
function cleanArticleText(text) {
  if (!text) return text;

  const lines = text.split('\n');

  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Skip photo credits
    if (trimmed.startsWith('\u00A9') || trimmed.startsWith('(c)')) return false;

    // Skip photo/image patterns
    if (/^(Photo|Illustration|Image|Figure|Fig\.|Cr\u00E9dit)\s*\d*/i.test(trimmed)) return false;

    // Skip UI text
    if (/^(Agrandir|Zoom|Voir|Lire aussi|\u00C0 lire aussi|Sur le m\u00EAme sujet|Advertisement|Share|Tweet|Email)/i.test(trimmed)) return false;

    // Skip short caption-like lines with credits
    if (trimmed.length < 150 && /(\u00A9|cr\u00E9dit|photo|AFP|Reuters|AP |Getty|NurPhoto)/i.test(trimmed)) return false;

    // Skip pull quotes
    if (trimmed.length < 100 && /^[\u00AB"'].+[\u00BB"']$/.test(trimmed)) return false;

    return true;
  });

  return cleanedLines
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Count words in text
 */
function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Validate URL
 */
function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Fetch and extract article
 */
async function extractArticle(url) {
  // Fetch the page
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RSVPReader/1.0; +https://rsvp-reader.example.com)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr,en;q=0.9',
    },
    cf: {
      cacheTtl: 300, // Cache for 5 minutes
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error('URL does not point to an HTML page');
  }

  const html = await response.text();

  // Parse HTML using linkedom
  const { document } = parseHTML(html);

  // Extract with Readability
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article) {
    throw new Error('Could not extract article content');
  }

  // Clean the text
  const cleanedContent = cleanArticleText(article.textContent);

  if (cleanedContent.length < 100) {
    throw new Error('Extracted content is too short');
  }

  return {
    title: article.title || 'Untitled',
    content: cleanedContent,
    wordCount: countWords(cleanedContent),
    source: new URL(url).hostname,
    excerpt: cleanedContent.substring(0, 200) + '...',
  };
}

/**
 * Handle requests
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Rate limiting
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Route handling
    if (url.pathname === '/api/extract') {
      const articleUrl = url.searchParams.get('url');

      if (!articleUrl) {
        return new Response(
          JSON.stringify({ error: 'Missing "url" parameter' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (!isValidUrl(articleUrl)) {
        return new Response(
          JSON.stringify({ error: 'Invalid URL format' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      try {
        const article = await extractArticle(articleUrl);
        return new Response(
          JSON.stringify(article),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message || 'Failed to extract article' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Not found
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  },
};
