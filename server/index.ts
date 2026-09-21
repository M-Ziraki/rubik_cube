/**
 * The production server: static files plus the Jev endpoint.
 *
 * Deliberately small - `node:http` and nothing else - because its whole job is
 * to hold a credential the browser must not see and to hand back files. If the
 * application is deployed behind a real web server, only `/api/jev/*` needs to
 * reach this; the `dist/` directory can be served by anything.
 *
 *   npm run build && npm run serve
 */

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { serveJev } from './transport';

const PORT = Number(process.env.PORT ?? 5173);
const ROOT = resolve(process.cwd(), 'dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  void (async () => {
    if (await serveJev(req, res)) return;

    // Static files, with the path confined to `dist/`.
    const requested = (req.url ?? '/').split('?')[0];
    const relative = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, '');
    let file = join(ROOT, relative);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
    } catch {
      // Unknown paths fall through to the app shell; the router is hash-based,
      // so this only matters for a stray request.
      file = join(ROOT, 'index.html');
    }

    try {
      statSync(file);
    } catch {
      res.writeHead(404).end('Not found');
      return;
    }

    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  })();
});

server.listen(PORT, () => {
  const configured = Boolean(process.env.TYPESAFE_API_KEY?.trim());
  // Says whether a key is present. Never says what it is.
  process.stdout.write(
    `Cube Atlas on http://127.0.0.1:${PORT}  `
    + `(Jev: ${configured ? 'server key configured' : 'no server key; bring your own or run without'})\n`,
  );
});
