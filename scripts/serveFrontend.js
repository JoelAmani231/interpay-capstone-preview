// scripts/serveFrontend.js — tiny static server for the web app (no dependencies).
// Serves only /Frontend and /Logos, then redirects "/" to the app.
const http = require('http');
const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ROOT    = path.resolve(__dirname, '..');
const PORT    = parseInt(process.env.FRONTEND_PORT) || 5050;
const APP     = '/Frontend/Capstone_Preview.html';
const ALLOWED = ['Frontend', 'Logos'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',   '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch { res.writeHead(400); return res.end('Bad request'); }

  if (urlPath === '/') { res.writeHead(302, { Location: APP }); return res.end(); }

  const rel  = path.normalize(urlPath).replace(/^([/\\])+/, '');
  const top  = rel.split(/[\\/]/)[0];
  const full = path.join(ROOT, rel);
  if (!ALLOWED.includes(top) || !full.startsWith(ROOT + path.sep)) { res.writeHead(404); return res.end('Not found'); }

  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
}).listen(PORT, () => console.log(`InterPay web app running on http://localhost:${PORT}`));
