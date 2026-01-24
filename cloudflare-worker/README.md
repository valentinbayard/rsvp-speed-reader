# RSVP Reader - Cloudflare Worker Proxy

This Cloudflare Worker provides article extraction functionality for the RSVP Speed Reader PWA.

## Features

- Fetches articles from any URL
- Extracts readable content using Mozilla's Readability algorithm
- Cleans text (removes photo credits, captions, UI elements)
- CORS support for cross-origin requests
- Simple rate limiting (30 requests/minute per IP)
- Response caching (5 minutes)

## API Endpoint

### Extract Article

```
GET /api/extract?url=<article-url>
```

**Response:**
```json
{
  "title": "Article Title",
  "content": "Cleaned article text...",
  "wordCount": 1234,
  "source": "example.com",
  "excerpt": "First 200 chars..."
}
```

**Errors:**
```json
{
  "error": "Error message"
}
```

### Health Check

```
GET /health
```

## Deployment

### Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
2. [Node.js](https://nodejs.org/) installed
3. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### Setup

1. Install dependencies:
   ```bash
   cd cloudflare-worker
   npm install
   ```

2. Authenticate with Cloudflare:
   ```bash
   npx wrangler login
   ```

3. Test locally:
   ```bash
   npm run dev
   ```

4. Deploy to Cloudflare:
   ```bash
   npm run deploy
   ```

5. After deployment, you'll get a URL like:
   ```
   https://rsvp-reader-proxy.<your-subdomain>.workers.dev
   ```

6. Enter this URL in the PWA settings as the API Endpoint.

## Configuration

Edit `wrangler.toml` to customize:

- `name`: Worker name (appears in Cloudflare dashboard)
- `routes`: Custom domain routing
- Environment-specific settings

## Custom Domain (Optional)

To use a custom domain:

1. Add your domain to Cloudflare
2. Uncomment and edit the `routes` section in `wrangler.toml`
3. Redeploy

## Limits (Free Tier)

- 100,000 requests/day
- 10ms CPU time per request
- Plenty for personal use!

## Troubleshooting

**"Failed to fetch article"**
- The website may be blocking requests
- Try a different article

**"Could not extract article content"**
- The page may not have recognizable article structure
- Use the text paste option in the PWA instead

**Rate limit errors**
- Wait 1 minute and try again
- Rate limit resets on worker restart

## Development

```bash
# Run local dev server
npm run dev

# View logs from deployed worker
npm run tail
```
