// LAST WORD — local static server for game/ (Node 22, stdlib only).
//
//   node serve.ts [--port 8080]
//
// Serves game/ on http://localhost:<port> so the game can be played and
// play-tested in a desktop browser with no build step. Development use
// only: it serves files from disk and does nothing else.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_ROOT = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function pickPort(): number {
  const at = process.argv.indexOf('--port');
  if (at === -1) return 8080;
  const value = Number(process.argv[at + 1]);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 8080;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

function safePath(rawPath: string): string | null {
  let cleaned: string;
  try {
    cleaned = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (cleaned.endsWith('/')) cleaned += 'index.html';
  const target = resolve(join(GAME_ROOT, normalize(cleaned)));
  if (target !== GAME_ROOT && !target.startsWith(GAME_ROOT + sep)) return null;
  return target;
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = safePath(url.pathname);
  if (file === null) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let bytes: number;
  try {
    const info = statSync(file);
    if (!info.isFile()) throw new Error('not a file');
    bytes = info.size;
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': bytes,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(pickPort(), '127.0.0.1', () => {
  console.log(`LAST WORD on http://localhost:${pickPort()}`);
});
