const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ─────────────────────────────────────────────
// CONFIG — change WATCH_FOLDER to your actual folder path
// Windows example: 'C:\\Users\\YourName\\Videos\\LifeGrower'
// Mac example:     '/Users/YourName/Movies/LifeGrower'
// ─────────────────────────────────────────────
const PORT = 3000;
const HOST_IP = '192.168.254.100';
const WATCH_FOLDER = process.env.WATCH_FOLDER || 'C:\\xampp\\htdocs\\lifegrower-cleanx_working\\sync_folder';

// Path to the yt-dlp executable used by /fetch-link. Install it separately
// (e.g. `winget install yt-dlp` or https://github.com/yt-dlp/yt-dlp) and make
// sure it's on PATH, or point YTDLP_PATH at the binary directly.
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
const PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
const ALLOWED_EXTS = [...VIDEO_EXTS, ...PHOTO_EXTS];

// Only these platforms may be fetched via /fetch-link
const ALLOWED_LINK_HOSTS = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch)$/i;

// Track which files have been downloaded by the phone
const syncedSet = new Set();

// In-memory job tracking for /fetch-link downloads: jobId -> { status, progress, file, error }
const downloadJobs = new Map();

function isSupportedLink(rawUrl) {
  try {
    const { hostname } = new url.URL(rawUrl);
    return ALLOWED_LINK_HOSTS.test(hostname);
  } catch {
    return false;
  }
}

function startDownloadJob(jobId, link) {
  const outputTemplate = path.join(WATCH_FOLDER, '%(title).70B [%(id)s].%(ext)s');
  const args = [
    '--no-playlist',
    '--newline',
    '--restrict-filenames',
    '-f', 'best[ext=mp4]/best',
    '--print', 'after_move:filepath',
    '-o', outputTemplate,
    link,
  ];

  let child;
  try {
    child = spawn(YTDLP_PATH, args);
  } catch (e) {
    downloadJobs.set(jobId, { status: 'error', error: `Could not start yt-dlp: ${e.message}` });
    return;
  }

  let finalPath = '';
  let stderrTail = '';
  // On Windows, a spawn ENOENT (executable not found) fires BOTH the 'error'
  // event and a 'close' event (with a bogus libuv exit code like -4058).
  // Without this guard, 'close' would overwrite the friendly ENOENT message.
  let settled = false;

  child.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const m = line.match(/\[download\]\s+([\d.]+)%/);
      if (m) {
        const job = downloadJobs.get(jobId);
        if (job && job.status === 'downloading') job.progress = parseFloat(m[1]);
        continue;
      }
      // --print after_move:filepath emits a plain absolute path (no [brackets])
      if (!line.startsWith('[') && line.trim()) finalPath = line.trim();
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });

  child.on('error', (err) => {
    if (settled) return;
    settled = true;
    downloadJobs.set(jobId, {
      status: 'error',
      error: err.code === 'ENOENT'
        ? 'yt-dlp is not installed (or not on PATH) on your PC. Install it — e.g. run "winget install yt-dlp.yt-dlp" in PowerShell, or download yt-dlp.exe from github.com/yt-dlp/yt-dlp/releases and place it in a folder on PATH — then restart server.js.'
        : `yt-dlp failed to start: ${err.message}`,
    });
    scheduleJobCleanup(jobId);
  });

  child.on('close', (code) => {
    if (settled) return;
    settled = true;
    if (code !== 0 || !finalPath || !fs.existsSync(finalPath)) {
      downloadJobs.set(jobId, {
        status: 'error',
        error: stderrTail.trim().split('\n').pop() || `yt-dlp exited with code ${code}`,
      });
      scheduleJobCleanup(jobId);
      return;
    }
    const stat = fs.statSync(finalPath);
    const name = path.basename(finalPath);
    const ext = path.extname(name).toLowerCase();
    downloadJobs.set(jobId, {
      status: 'done',
      file: {
        name,
        size: stat.size,
        type: VIDEO_EXTS.includes(ext) ? 'video' : 'photo',
        url: `http://${HOST_IP}:${PORT}/file/${encodeURIComponent(name)}`,
      },
    });
    scheduleJobCleanup(jobId);
  });
}

function scheduleJobCleanup(jobId) {
  setTimeout(() => downloadJobs.delete(jobId), 5 * 60 * 1000);
}

// Ensure the watch folder exists
if (!fs.existsSync(WATCH_FOLDER)) {
  fs.mkdirSync(WATCH_FOLDER, { recursive: true });
  console.log(`📁 Created sync folder: ${path.resolve(WATCH_FOLDER)}`);
}

function getLocalIP() {
  const os = require('os');
  const nets = os.networkInterfaces();

  const preferred = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family !== 'IPv4' || net.internal) continue;

      const lname = name.toLowerCase();

      // Skip virtual adapters
      if (
        lname.includes('virtual') ||
        lname.includes('vmware') ||
        lname.includes('vbox') ||
        lname.includes('hyper-v') ||
        lname.includes('loopback')
      ) {
        continue;
      }

      preferred.push(net.address);
    }
  }

  return preferred[0] || '127.0.0.1';
}

function listFiles() {
  try {
    return fs.readdirSync(WATCH_FOLDER)
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ALLOWED_EXTS.includes(ext) && !f.startsWith('.');
      })
      .map(name => {
        const filePath = path.join(WATCH_FOLDER, name);
        const stat = fs.statSync(filePath);
        const ext = path.extname(name).toLowerCase();
        return {
          name,
          size: stat.size,
          synced: syncedSet.has(name),
          type: VIDEO_EXTS.includes(ext) ? 'video' : 'photo',
          url: `http://${HOST_IP}:${PORT}/file/${encodeURIComponent(name)}`,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    return [];
  }
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── GET /files — list all files with sync status ──────────────────────────
  if (req.method === 'GET' && pathname === '/files') {
    const files = listFiles();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ files, folder: path.resolve(WATCH_FOLDER) }));
    return;
  }

  // ── GET /pending — only unsynced files ────────────────────────────────────
  if (req.method === 'GET' && pathname === '/pending') {
    const files = listFiles().filter(f => !f.synced);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ files, total: listFiles().length, pending: files.length }));
    return;
  }

  // ── GET /file/:name — download a file ─────────────────────────────────────
  if (req.method === 'GET' && pathname.startsWith('/file/')) {
    const name = decodeURIComponent(pathname.replace('/file/', ''));
    const filePath = path.join(WATCH_FOLDER, name);

    // Security: prevent path traversal
    // Security: prevent path traversal
    const resolvedWatch = path.resolve(WATCH_FOLDER);
    const resolvedFile  = path.resolve(filePath);

    console.log('Watch:', resolvedWatch);
    console.log('File: ', resolvedFile);

    if (!resolvedFile.startsWith(resolvedWatch)) {
      console.log('❌ PATH TRAVERSAL BLOCKED');
      res.writeHead(403); res.end('Forbidden'); return;
    }

    console.log('Watch:', resolvedWatch);
    console.log('File: ', resolvedFile);

    if (!resolvedFile.startsWith(resolvedWatch)) {
      console.log('❌ PATH TRAVERSAL BLOCKED');
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404); res.end('Not found'); return;
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(name).toLowerCase();
    const MIME_MAP = {
      '.mp4': 'video/mp4', '.m4v': 'video/x-m4v', '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic',
    };
    const mime = MIME_MAP[ext] || (VIDEO_EXTS.includes(ext) ? 'video/mp4' : 'application/octet-stream');

    // Support range requests (important for video streaming)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunk = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunk,
        'Content-Type': mime,
      });
      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', (err) => {
        console.log('❌ Read stream error (range):', err.message);
        if (!res.writableEnded) res.destroy();
      });
      req.on('close', () => stream.destroy());
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
      });
      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => {
        console.log('❌ Read stream error:', err.message);
        if (!res.writableEnded) res.destroy();
      });
      req.on('close', () => stream.destroy());
      stream.pipe(res);
    }
    return;
  }

  // ── POST /upload?name=video.mp4 — phone/browser sends a file to the server ─
  if (req.method === 'POST' && pathname === '/upload') {
    const rawName = parsed.query.name;
    if (!rawName || typeof rawName !== 'string') {
      res.writeHead(400); res.end('Missing ?name= query param'); return;
    }

    // Sanitize: strip any path separators so this can never escape WATCH_FOLDER
    const safeName = path.basename(rawName);
    const ext = path.extname(safeName).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      res.writeHead(400); res.end('Unsupported file type'); return;
    }

    // Avoid overwriting an existing file by suffixing (1), (2), etc.
    let finalName = safeName;
    let counter = 1;
    const base = path.basename(safeName, ext);
    while (fs.existsSync(path.join(WATCH_FOLDER, finalName))) {
      finalName = `${base} (${counter})${ext}`;
      counter++;
    }

    const destPath = path.join(WATCH_FOLDER, finalName);
    const writeStream = fs.createWriteStream(destPath);

    req.pipe(writeStream);

    writeStream.on('finish', () => {
      console.log(`✅ Uploaded: ${finalName}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name: finalName }));
    });

    writeStream.on('error', (err) => {
      console.log('❌ Upload write error:', err.message);
      res.writeHead(500); res.end('Upload failed');
    });

    req.on('error', (err) => {
      console.log('❌ Upload request error:', err.message);
      writeStream.destroy();
    });

    return;
  }

  // ── POST /fetch-link — download a YouTube/Instagram/Facebook video via yt-dlp
  if (req.method === 'POST' && pathname === '/fetch-link') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let parsedBody;
      try { parsedBody = JSON.parse(body); } catch { res.writeHead(400); res.end('Bad JSON'); return; }
      const link = typeof parsedBody.url === 'string' ? parsedBody.url.trim() : '';
      if (!link) { res.writeHead(400); res.end('Missing url'); return; }
      if (!isSupportedLink(link)) {
        res.writeHead(400); res.end('Only YouTube, Instagram, and Facebook links are supported'); return;
      }

      const jobId = crypto.randomBytes(8).toString('hex');
      downloadJobs.set(jobId, { status: 'downloading', progress: 0 });
      startDownloadJob(jobId, link);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, jobId }));
    });
    return;
  }

  // ── GET /fetch-status/:jobId — poll progress of a /fetch-link download ────
  if (req.method === 'GET' && pathname.startsWith('/fetch-status/')) {
    const jobId = pathname.replace('/fetch-status/', '');
    const job = downloadJobs.get(jobId);
    if (!job) { res.writeHead(404); res.end('Unknown job'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(job));
    return;
  }

  // ── POST /mark-synced — phone tells server a file was saved ───────────────
  if (req.method === 'POST' && pathname === '/mark-synced') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { names } = JSON.parse(body); // array of filenames
        if (Array.isArray(names)) names.forEach(n => syncedSet.add(n));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, syncedCount: syncedSet.size }));
      } catch {
        res.writeHead(400); res.end('Bad request');
      }
    });
    return;
  }

  // ── POST /reset-synced — clear sync state (re-sync everything) ────────────
  if (req.method === 'POST' && pathname === '/reset-synced') {
    syncedSet.clear();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── GET / — serve the upload dashboard ────────────────────────────────────
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getDashboardHTML(getLocalIP()));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = HOST_IP;
  console.log('\n🌱 LifeGrower Sync Server running!');
  console.log(`📁 Watching folder: ${path.resolve(WATCH_FOLDER)}`);
  console.log(`🌐 Dashboard:       http://localhost:${PORT}`);
  console.log(`📱 Phone connects:  http://${ip}:${PORT}`);
  console.log(`\nDrop videos/photos into the sync folder, then tap Sync on your phone.\n`);
});

function getDashboardHTML(ip) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>LifeGrower Sync</title>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #0f0f0f; color: #e0e0e0; padding: 32px; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .sub { color: #888; font-size: 14px; margin-bottom: 28px; }
    .ip-box { background: #1a1a1a; border: 1px solid #333; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; }
    .ip-box code { color: #f0c060; font-size: 18px; font-weight: 700; }
    .stats { display: flex; gap: 12px; margin-bottom: 24px; }
    .stat { background: #1a1a1a; border: 1px solid #333; border-radius: 10px; padding: 14px 20px; flex: 1; }
    .stat-val { font-size: 28px; font-weight: 800; color: #f0c060; }
    .stat-lbl { font-size: 12px; color: #888; margin-top: 2px; }
    .actions { display: flex; gap: 10px; margin-bottom: 20px; }
    button { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 14px; }
    .btn-primary { background: #f0c060; color: #111; }
    .btn-danger  { background: #c0392b; color: #fff; }
    .btn-ghost   { background: #1a1a1a; color: #aaa; border: 1px solid #333; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; color: #888; padding: 8px 12px; border-bottom: 1px solid #222; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 10px 12px; border-bottom: 1px solid #1a1a1a; font-size: 14px; }
    tr:hover td { background: #1a1a1a; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .badge-done    { background: #1a3a1a; color: #4caf50; }
    .badge-pending { background: #3a2a0a; color: #f0c060; }
    .folder-path { font-size: 12px; color: #555; font-family: monospace; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>🌱 LifeGrower Sync</h1>
  <p class="sub">Drop files into the sync folder, then tap Sync on your phone.</p>

  <div class="ip-box">
    📱 Phone server address: <code>http://${ip}:${PORT}</code>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-val" id="totalCount">—</div><div class="stat-lbl">Total Files</div></div>
    <div class="stat"><div class="stat-val" id="pendingCount">—</div><div class="stat-lbl">Pending Sync</div></div>
    <div class="stat"><div class="stat-val" id="syncedCount">—</div><div class="stat-lbl">Synced</div></div>
  </div>

  <div class="actions">
    <button class="btn-primary" onclick="load()">🔄 Refresh</button>
    <button class="btn-danger"  onclick="resetSynced()">↩ Reset Sync State</button>
    <button class="btn-ghost"   onclick="document.getElementById('fileInput').click()">⬆ Upload File</button>
    <input type="file" id="fileInput" accept="video/*,image/*" style="display:none" onchange="uploadFile(this.files[0])">
  </div>
  <p id="uploadStatus" style="font-size:13px;color:#888;margin-bottom:16px;"></p>

  <p class="folder-path" id="folderPath"></p>

  <table>
    <thead><tr><th>File</th><th>Type</th><th>Size</th><th>Status</th></tr></thead>
    <tbody id="fileList"><tr><td colspan="4" style="color:#555">Loading…</td></tr></tbody>
  </table>

  <script>
    function fmt(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
      return (bytes/1048576).toFixed(1) + ' MB';
    }

    async function load() {
      const r = await fetch('/files');
      const { files, folder } = await r.json();
      document.getElementById('folderPath').textContent = '📁 ' + folder;
      document.getElementById('totalCount').textContent   = files.length;
      document.getElementById('pendingCount').textContent = files.filter(f => !f.synced).length;
      document.getElementById('syncedCount').textContent  = files.filter(f =>  f.synced).length;
      const tbody = document.getElementById('fileList');
      if (files.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:#555">No files in sync folder yet.</td></tr>';
        return;
      }
      tbody.innerHTML = files.map(f => \`
        <tr>
          <td>\${f.name}</td>
          <td>\${f.type}</td>
          <td>\${fmt(f.size)}</td>
          <td><span class="badge \${f.synced ? 'badge-done' : 'badge-pending'}">\${f.synced ? '✓ Synced' : '⏳ Pending'}</span></td>
        </tr>
      \`).join('');
    }

    async function uploadFile(file) {
      if (!file) return;
      const statusEl = document.getElementById('uploadStatus');
      statusEl.textContent = 'Uploading ' + file.name + '…';
      try {
        const r = await fetch('/upload?name=' + encodeURIComponent(file.name), {
          method: 'POST',
          body: file,
        });
        const data = await r.json();
        if (data.ok) {
          statusEl.textContent = '✅ Uploaded as ' + data.name;
          load();
        } else {
          statusEl.textContent = '❌ Upload failed';
        }
      } catch (e) {
        statusEl.textContent = '❌ Upload error: ' + e.message;
      }
    }

    async function resetSynced() {
      if (!confirm('Reset sync state? The phone will re-download all files.')) return;
      await fetch('/reset-synced', { method: 'POST' });
      load();
    }

    load();
    setInterval(load, 5000);
  </script>
</body>
</html>`;
}
