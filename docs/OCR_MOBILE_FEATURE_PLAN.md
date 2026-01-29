# OCR Mobile Feature Plan

## Overview

Allow mobile PWA users to photograph printed text, extract it via OCR, and speed-read with RSVP.

**User Flow:**
1. Open PWA on mobile
2. Tap camera button to take a photo of text
3. OCR processes the image
4. User reviews/edits extracted text
5. Tap "Read" to start RSVP speed reading

---

## Architecture Decision: Camera Capture

### Recommended: File Input with Capture Attribute

```html
<input type="file" accept="image/*" capture="environment">
```

**Why this approach:**
- Maximum browser compatibility (iOS Safari, Android Chrome)
- Native camera UI (familiar to users)
- No complex permission management
- Supports both camera and gallery selection
- Simple to implement and maintain

**Alternatives considered:**
- `MediaDevices.getUserMedia()` - More complex, iOS Safari restrictions
- `ImageCapture API` - Limited browser support

---

## Architecture Decision: OCR Engine

### Recommended: Tesseract.js (Client-Side)

**Why Tesseract.js:**
- Fully offline capable (critical for PWA)
- Privacy-preserving (images never leave device)
- No API costs or backend changes
- Supports French + English (100+ languages available)

**Trade-offs:**
- Initial download: ~15-20MB for language data
- Processing time: 3-10 seconds per image on mobile
- Accuracy depends on image quality

**Performance expectations:**
| Device | Processing Time |
|--------|----------------|
| iPhone 12+ | 3-5 seconds |
| Mid-range Android | 5-10 seconds |
| Low-end devices | 10-20 seconds |

---

## User Interface Design

### Main Screen - Add OCR Input Section

```
┌────────────────────────────────────────┐
│  RSVP Reader              [Settings ⚙] │
├────────────────────────────────────────┤
│  URL de l'article                      │
│  [https://...                    ][📖] │
│                                        │
│                  ou                    │
│                                        │
│  Coller du texte                       │
│  ┌────────────────────────────────┐   │
│  │ Collez votre texte ici...      │   │
│  └────────────────────────────────┘   │
│  [         Lire le texte         ]    │
│                                        │
│                  ou                    │
│                                        │
│  Scanner une page              ← NEW   │
│  ┌────────────────────────────────┐   │
│  │         📷                     │   │
│  │    Prendre une photo           │   │
│  │    ou choisir une image        │   │
│  └────────────────────────────────┘   │
│  [       Scanner le texte        ]    │
└────────────────────────────────────────┘
```

### OCR Processing Modal

```
┌────────────────────────────────────────┐
│                                        │
│     ┌────────────────────────┐        │
│     │   [Image Preview]      │        │
│     └────────────────────────┘        │
│                                        │
│     Reconnaissance du texte...         │
│     ████████████░░░░░░░░  45%         │
│                                        │
│     [      Annuler      ]              │
│                                        │
└────────────────────────────────────────┘
```

### Text Review Screen

```
┌────────────────────────────────────────┐
│  ←  Texte extrait                      │
├────────────────────────────────────────┤
│                                        │
│  ┌────────────────────────────────┐   │
│  │ Lorem ipsum dolor sit amet,    │   │
│  │ consectetur adipiscing elit.   │   │
│  │ Sed do eiusmod tempor...       │   │
│  └────────────────────────────────┘   │
│            (editable textarea)         │
│                                        │
│  523 mots détectés                     │
│                                        │
│  [   Reprendre la photo   ]            │
│  [      Lire le texte     ]  ← Primary │
│                                        │
└────────────────────────────────────────┘
```

---

## Technical Implementation

### New Files

```
packages/web/
├── js/
│   └── ocr.js           # Tesseract.js wrapper module
```

### Files to Modify

| File | Changes |
|------|---------|
| `packages/web/index.html` | Add OCR section, modals, Tesseract script |
| `packages/web/js/app.js` | Add OCR handlers, integrate with reading flow |
| `packages/web/css/styles.css` | Add OCR UI styles |
| `packages/web/sw.js` | Cache Tesseract assets for offline |
| `packages/web/js/storage.js` | Add OCR settings |

### Integration Flow

```
Camera/Gallery Input
        ↓
File selected → Show preview
        ↓
User taps "Scanner le texte"
        ↓
Image Preprocessing (resize to max 2000px, boost contrast)
        ↓
Tesseract.js OCR (fra+eng languages)
        ↓
Show extracted text (editable)
        ↓
User taps "Lire le texte"
        ↓
[Existing Flow] → cleanArticleText() → startReading()
```

### Image Preprocessing Pipeline

```javascript
async function preprocessImage(file) {
  // 1. Load image
  const img = await loadImage(file);

  // 2. Resize if too large (max 2000px)
  const maxDim = 2000;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));

  // 3. Draw to canvas with contrast boost
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.filter = 'contrast(1.15)';
  ctx.drawImage(img, 0, 0, width * scale, height * scale);

  // 4. Return as blob
  return canvas.toBlob(blob => blob, 'image/png', 0.95);
}
```

### OCR Module API

```javascript
// packages/web/js/ocr.js
window.OCRModule = {
  // Perform OCR on an image
  recognizeText(imageFile, onProgress) → Promise<{
    text: string,
    confidence: number,
    wordCount: number,
    isLowConfidence: boolean
  }>,

  // Cancel ongoing OCR
  cancelOCR() → void,

  // Check availability
  isSupported() → boolean,

  // Cleanup worker
  terminate() → Promise<void>
}
```

---

## Offline Support Strategy

### First-Time Setup
1. User triggers OCR for first time
2. Show download progress: "Téléchargement des données linguistiques (~15 Mo)"
3. Cache language data in Service Worker cache
4. All subsequent uses are fully offline

### Service Worker Caching

```javascript
// Cache Tesseract assets from CDN
const TESSERACT_CACHE = 'tesseract-v1';

// Cache on first request
if (url.hostname === 'unpkg.com' ||
    url.hostname === 'tessdata.projectnaptha.com') {
  // Cache-first strategy
  return caches.match(request) || fetch(request);
}
```

---

## Error Handling

| Error | French Message | Action |
|-------|---------------|--------|
| Camera denied | "Accès à la caméra refusé" | Show settings link |
| Image too large | "Image trop volumineuse (max 20 Mo)" | Prompt resize |
| No text found | "Aucun texte détecté" | Suggest retake |
| Low confidence | "Qualité faible. Vérifiez le texte." | Show editable result |
| OCR failed | "Échec de la reconnaissance" | Offer manual paste |
| Network error | "Erreur de chargement" | Retry button |

---

## Performance Optimizations

### 1. Lazy Load Tesseract
Only load Tesseract.js when user interacts with OCR section:
```javascript
document.getElementById('ocr-zone').addEventListener('click', loadTesseract, { once: true });
```

### 2. Progressive Loading UI
Show meaningful progress states:
- "Chargement du moteur OCR..."
- "Optimisation de l'image..."
- "Reconnaissance du texte..."

### 3. Memory Management
- Limit image dimensions to 2000px max
- Use `URL.revokeObjectURL()` after image loads
- Terminate worker when not in use

---

## Settings Additions

```javascript
DEFAULT_SETTINGS = {
  // ... existing ...
  ocrLanguage: 'fra+eng',    // OCR languages
  ocrShowPreview: true,      // Show text preview before reading
}
```

---

## Implementation Phases

### Phase 1: Core OCR (MVP)
- [x] Add Tesseract.js integration
- [x] File input with capture attribute
- [x] Basic image preprocessing
- [x] Display extracted text
- [x] Connect to reading flow

### Phase 2: UI/UX Polish
- [ ] Image preview with clear button
- [ ] Progress modal with cancel
- [ ] Editable text review screen
- [ ] Error states and messages
- [ ] French translations

### Phase 3: Optimization
- [ ] Lazy load Tesseract
- [ ] Service Worker caching
- [ ] Memory optimization
- [ ] Performance testing

### Phase 4: Testing
- [ ] iOS Safari testing
- [ ] Android Chrome testing
- [ ] Offline functionality
- [ ] Edge cases (rotated images, low quality)

---

## Future Enhancements

1. **Document guides**: Visual alignment helpers for photographing pages
2. **Batch scanning**: Process multiple pages in sequence
3. **Language detection**: Auto-detect text language
4. **PDF import**: Extract text from PDF files
5. **Cloud OCR option**: Google Vision API for better accuracy (opt-in)
6. **Image share target**: Accept images via Web Share Target API

---

## Key Files Reference

| Purpose | File Path |
|---------|-----------|
| Main app logic | `packages/web/js/app.js` |
| HTML structure | `packages/web/index.html` |
| Styles | `packages/web/css/styles.css` |
| Service Worker | `packages/web/sw.js` |
| Settings | `packages/web/js/storage.js` |
| Text cleaning | `packages/shared/src/text-utils.js` |
| RSVP engine | `packages/shared/src/rsvp-engine.js` |
