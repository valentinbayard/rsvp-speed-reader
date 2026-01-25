#!/usr/bin/env node
/**
 * Creates PWA icons using Node.js with no dependencies
 * Opens a browser to generate and download the icons
 */

const http = require('http');
const { exec } = require('child_process');

const html = `<!DOCTYPE html>
<html>
<head>
  <title>PWA Icon Generator</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #1a1a2e; color: white; }
    canvas { border: 1px solid #333; margin: 10px; }
    button { padding: 10px 20px; font-size: 16px; cursor: pointer; margin: 20px 0; }
    .done { color: #4ade80; }
  </style>
</head>
<body>
  <h1>PWA Icon Generator</h1>
  <p>Click the button to download all icons:</p>
  <button onclick="downloadAll()">Download All Icons</button>
  <p id="status"></p>

  <h3>Preview:</h3>
  <div>
    <canvas id="icon192" width="192" height="192"></canvas>
    <canvas id="icon512" width="512" height="512"></canvas>
    <canvas id="maskable" width="512" height="512"></canvas>
  </div>

  <script>
    function drawIcon(canvas, size, maskable = false) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0f0f23';
      ctx.fillRect(0, 0, size, size);

      const padding = maskable ? size * 0.15 : size * 0.1;

      ctx.fillStyle = '#e94560';
      ctx.font = 'bold ' + (size * 0.5) + 'px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('R', size / 2, size / 2 + size * 0.02);

      const lineWidth = Math.max(2, size * 0.015);
      const lineHeight = size * 0.15;
      ctx.fillRect(size / 2 - lineWidth / 2, padding, lineWidth, lineHeight);
      ctx.fillRect(size / 2 - lineWidth / 2, size - padding - lineHeight, lineWidth, lineHeight);
    }

    drawIcon(document.getElementById('icon192'), 192);
    drawIcon(document.getElementById('icon512'), 512);
    drawIcon(document.getElementById('maskable'), 512, true);

    function download(canvas, filename) {
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }

    function downloadAll() {
      download(document.getElementById('icon192'), 'icon-192.png');
      setTimeout(() => download(document.getElementById('icon512'), 'icon-512.png'), 100);
      setTimeout(() => download(document.getElementById('maskable'), 'maskable-icon.png'), 200);
      document.getElementById('status').innerHTML = '<span class="done">✓ Icons downloaded! Move them to web/icons/ folder and redeploy.</span>';
    }
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(3456, () => {
  console.log('Opening browser to generate icons...');
  console.log('URL: http://localhost:3456');
  console.log('');
  console.log('1. Click "Download All Icons"');
  console.log('2. Move the downloaded files to web/icons/');
  console.log('3. Press Ctrl+C to stop this server');

  // Try to open browser
  const url = 'http://localhost:3456';
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(cmd + ' ' + url);
});
