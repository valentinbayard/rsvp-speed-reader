#!/usr/bin/env node
// Build script to create browser-compatible (IIFE) bundle for Chrome Extension

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const distDir = path.join(__dirname, '..', 'dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read source files
const rsvpEngine = fs.readFileSync(path.join(srcDir, 'rsvp-engine.js'), 'utf8');
const settings = fs.readFileSync(path.join(srcDir, 'settings.js'), 'utf8');
const textUtils = fs.readFileSync(path.join(srcDir, 'text-utils.js'), 'utf8');

// Remove ES module syntax and wrap in IIFE
function convertToIIFE(code, globalName) {
  // Remove export keywords
  let converted = code
    .replace(/^export\s+(const|let|var|function|class)\s+/gm, '$1 ')
    .replace(/^export\s+\{[^}]+\};?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, '');

  return converted;
}

// Build rsvp-engine.browser.js
const rsvpBrowser = `// RSVP Engine - Browser bundle (auto-generated)
// Do not edit directly - edit src/rsvp-engine.js instead

(function(global) {
  'use strict';

${convertToIIFE(rsvpEngine)}

  // Expose to global scope
  global.RSVPReader = RSVPReader;
  global.rsvpUtils = rsvpUtils;

})(typeof window !== 'undefined' ? window : this);
`;

fs.writeFileSync(path.join(distDir, 'rsvp-engine.browser.js'), rsvpBrowser);
console.log('Built: dist/rsvp-engine.browser.js');

// Build settings.browser.js
const settingsBrowser = `// Settings - Browser bundle (auto-generated)

(function(global) {
  'use strict';

${convertToIIFE(settings)}

  // Expose to global scope
  global.RSVPSettings = {
    DEFAULT_SETTINGS,
    SETTINGS_BOUNDS,
    validateSettings
  };

})(typeof window !== 'undefined' ? window : this);
`;

fs.writeFileSync(path.join(distDir, 'settings.browser.js'), settingsBrowser);
console.log('Built: dist/settings.browser.js');

// Build text-utils.browser.js
const textUtilsBrowser = `// Text Utils - Browser bundle (auto-generated)

(function(global) {
  'use strict';

${convertToIIFE(textUtils)}

  // Expose to global scope
  global.TextUtils = {
    cleanArticleText,
    extractUrlFromText,
    isValidUrl
  };

})(typeof window !== 'undefined' ? window : this);
`;

fs.writeFileSync(path.join(distDir, 'text-utils.browser.js'), textUtilsBrowser);
console.log('Built: dist/text-utils.browser.js');

console.log('\\nBrowser bundles ready in dist/');
