const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const iconsDir = path.join(__dirname, '..', 'icons');
const svgNormal = fs.readFileSync(path.join(iconsDir, 'icon.svg'), 'utf8');
const svgMaskable = fs.readFileSync(path.join(iconsDir, 'icon-maskable.svg'), 'utf8');

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body>
        <script>
          const svgNormalStr = ${JSON.stringify(svgNormal)};
          const svgMaskableStr = ${JSON.stringify(svgMaskable)};

          function svgToPng(svgStr, w, h) {
            return new Promise((resolve, reject) => {
              const img = new Image();
              const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/png'));
              };
              img.onerror = reject;
              img.src = url;
            });
          }

          async function run() {
            try {
              const files = {
                'icon-192.png': await svgToPng(svgNormalStr, 192, 192),
                'icon-512.png': await svgToPng(svgNormalStr, 512, 512),
                'apple-touch-icon.png': await svgToPng(svgNormalStr, 180, 180),
                'favicon.png': await svgToPng(svgNormalStr, 32, 32),
                'icon-maskable-192.png': await svgToPng(svgMaskableStr, 192, 192),
                'icon-maskable-512.png': await svgToPng(svgMaskableStr, 512, 512)
              };

              await fetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(files)
              });
              window.close();
            } catch(e) {
              console.error(e);
            }
          }
          run();
        </script>
      </body>
      </html>
    `);
  } else if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const data = JSON.parse(body);
      for (const [filename, dataUrl] of Object.entries(data)) {
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        const filePath = path.join(iconsDir, filename);
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        console.log('✓ Generated:', filename, `(${fs.statSync(filePath).size} bytes)`);
      }
      res.writeHead(200);
      res.end('OK');
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 500);
    });
  }
});

server.listen(48921, '127.0.0.1', () => {
  console.log('Temporary icon render server listening on port 48921...');
  const proc = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    'http://127.0.0.1:48921/'
  ]);
  proc.on('error', err => {
    console.error('Browser spawn error:', err);
  });
});
