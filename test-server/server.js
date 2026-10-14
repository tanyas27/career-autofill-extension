/**
 * Career Autofill - Local Test Server
 * Lightweight zero-dependency HTTP server to test Career Autofill extension across all ATS form types.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3333;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Normalize URL path
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // Prevent directory traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>404 Not Found</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h2>404 - Page Not Found</h2>
          <p>Requested: <code>${reqPath}</code></p>
          <p><a href="/">Return to Test Suite Hub</a></p>
        </body>
        </html>
      `);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Allow CORS and iframe embedding for iframe test page
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    // Explicitly allow embedding in iframes for local testing
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Career Autofill Test Server is running at: http://localhost:${PORT}`);
  console.log(`Available Test Suites:`);
  console.log(`  • Hub / Overview:         http://localhost:${PORT}/index.html`);
  console.log(`  • Workday ATS:            http://localhost:${PORT}/workday.html`);
  console.log(`  • Greenhouse / Lever:     http://localhost:${PORT}/greenhouse.html`);
  console.log(`  • SmartRecruiters Web:    http://localhost:${PORT}/smartrecruiters.html`);
  console.log(`  • Legacy Taleo Table:     http://localhost:${PORT}/taleo.html`);
  console.log(`  • Tailwind Dynamic SPA:   http://localhost:${PORT}/tailwind-spa.html`);
  console.log(`  • Multi-Frame Iframe:     http://localhost:${PORT}/iframe-test.html\n`);
});

// Clean shutdown handling
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
