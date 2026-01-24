# RSVP Speed Reader - Android/Mobile Port Plan

## Overview

This document outlines the plan to create a mobile-friendly Progressive Web App (PWA) version of the RSVP Speed Reader, optimized for Android devices with a "2 clicks to read" user experience.

## Target User Flow

```
User reads article in Chrome/App
        ↓
    Tap Share button
        ↓
  Select "RSVP Reader"
        ↓
   PWA opens with URL
        ↓
  Article extracted → Reading starts
```

**Alternative flows:**
- Direct URL paste in PWA
- Text paste for non-URL content
- Bookmarklet for in-browser activation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Android Device                          │
│  ┌─────────────┐    ┌─────────────────────────────────┐    │
│  │ Chrome/App  │───▶│         RSVP Reader PWA         │    │
│  │  (Share)    │    │  ┌─────────────────────────┐   │    │
│  └─────────────┘    │  │   Service Worker        │   │    │
│                     │  │   - Offline support     │   │    │
│                     │  │   - Share target handler│   │    │
│                     │  └─────────────────────────┘   │    │
│                     │  ┌─────────────────────────┐   │    │
│                     │  │   Main App              │   │    │
│                     │  │   - URL/text input      │   │    │
│                     │  │   - Settings            │   │    │
│                     │  │   - RSVP Reader         │   │    │
│                     │  └─────────────────────────┘   │    │
│                     └───────────────┬───────────────┘    │
└─────────────────────────────────────┼───────────────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │   Cloudflare Worker (Proxy)   │
                      │   - Fetch article URL         │
                      │   - Extract with Readability  │
                      │   - Return clean text         │
                      └───────────────────────────────┘
```

## File Structure

```
web/
├── index.html              # Main PWA entry point
├── manifest.json           # PWA manifest with share_target
├── sw.js                   # Service worker
├── css/
│   └── styles.css          # Mobile-optimized styles
├── js/
│   ├── app.js              # Main application logic
│   ├── rsvp-engine.js      # Core RSVP engine (ported)
│   ├── storage.js          # LocalStorage settings manager
│   └── api.js              # Cloudflare proxy client
├── icons/
│   ├── icon-192.png        # PWA icon
│   ├── icon-512.png        # PWA icon (large)
│   └── maskable-icon.png   # Adaptive icon for Android
└── lib/
    └── Readability.js      # Mozilla Readability (fallback)

cloudflare-worker/
├── worker.js               # Cloudflare Worker script
├── wrangler.toml           # Cloudflare config
└── README.md               # Deployment instructions
```

## Key Components

### 1. PWA Manifest with Share Target

```json
{
  "share_target": {
    "action": "/share",
    "method": "GET",
    "params": {
      "url": "url",
      "text": "text",
      "title": "title"
    }
  }
}
```

When user shares a URL, the PWA opens with `?url=<shared-url>`.

### 2. Service Worker Responsibilities

- Cache static assets for offline use
- Intercept share target requests
- Handle background sync for settings

### 3. Cloudflare Worker Proxy

**Endpoint:** `GET /api/extract?url=<article-url>`

**Response:**
```json
{
  "title": "Article Title",
  "content": "Cleaned article text...",
  "wordCount": 1234,
  "source": "example.com"
}
```

**Features:**
- Fetches article HTML
- Extracts content with Readability.js
- Cleans text (removes credits, captions, etc.)
- Returns JSON response
- CORS headers for PWA access

### 4. Mobile Touch Controls

| Gesture | Action |
|---------|--------|
| Tap center | Pause/Resume |
| Swipe left | Skip back 5 words |
| Swipe right | Skip forward 5 words |
| Swipe up | Increase speed |
| Swipe down | Decrease speed |
| Tap X / Swipe down from top | Exit |

### 5. Settings (persisted in LocalStorage)

- Reading speed (WPM): 100-1000, default 550
- Countdown duration: 0-3 seconds
- Pause on punctuation: on/off
- Adjust for word length: on/off
- Theme: dark (default) / light
- Language: French / English

## Implementation Phases

### Phase 1: Core PWA
- [ ] Create index.html with basic structure
- [ ] Port rsvp-engine.js (remove Chrome dependencies)
- [ ] Create mobile-optimized CSS
- [ ] Implement touch controls
- [ ] Add LocalStorage settings

### Phase 2: Share Target
- [ ] Configure manifest.json with share_target
- [ ] Create service worker with share handling
- [ ] Handle incoming shared URLs
- [ ] Test on Android Chrome

### Phase 3: Cloudflare Proxy
- [ ] Create Cloudflare Worker with Readability
- [ ] Implement article extraction endpoint
- [ ] Add error handling and fallbacks
- [ ] Deploy to Cloudflare free tier

### Phase 4: Polish
- [ ] Add PWA install prompt
- [ ] Create app icons
- [ ] Add loading states and error messages
- [ ] Test offline functionality
- [ ] Performance optimization

## Hosting Options

| Option | Cost | Setup | Custom Domain |
|--------|------|-------|---------------|
| GitHub Pages | Free | Easy | Yes (CNAME) |
| Cloudflare Pages | Free | Easy | Yes |
| Vercel | Free | Easy | Yes |
| Netlify | Free | Easy | Yes |

**Recommendation:** Cloudflare Pages (same ecosystem as Worker)

## CORS Strategy

The Cloudflare Worker handles CORS by:
1. Receiving URL from PWA
2. Fetching article server-side (no CORS)
3. Returning extracted text with `Access-Control-Allow-Origin: *`

**Fallback:** If proxy fails, show manual text paste option.

## Testing Checklist

- [ ] Share from Chrome mobile
- [ ] Share from news apps (Reddit, Twitter, etc.)
- [ ] Install to home screen
- [ ] Offline reading (cached article)
- [ ] Touch controls responsiveness
- [ ] Various screen sizes
- [ ] Landscape orientation
- [ ] Settings persistence

## Security Considerations

- Cloudflare Worker validates URL format
- Rate limiting on proxy endpoint
- No user data stored server-side
- HTTPS required for PWA features

## Future Enhancements

- Reading history (local)
- Bookmarked articles
- Reading statistics
- Multiple language support
- Customizable themes
- Text-to-speech option
