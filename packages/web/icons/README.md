# PWA Icons

This folder should contain the following icons for the PWA:

## Required Icons

| File | Size | Purpose |
|------|------|---------|
| `icon-192.png` | 192x192 | Standard PWA icon |
| `icon-512.png` | 512x512 | Large PWA icon, splash screen |
| `maskable-icon.png` | 512x512 | Adaptive icon for Android (with safe zone padding) |

## Creating Icons

### From the SVG template

Use `icon.svg` as a base and export to PNG at the required sizes.

### Using an online tool

1. Go to [PWA Asset Generator](https://pwa-asset-generator.nickvision.org/)
2. Upload your icon
3. Download the generated assets

### Maskable Icon Guidelines

For `maskable-icon.png`:
- The main content should be within the center 80% of the image
- Add padding around the edges (the "safe zone")
- Use [Maskable.app](https://maskable.app/) to test

## Placeholder

Until you create proper icons, the app will work but won't look as polished on the home screen.
