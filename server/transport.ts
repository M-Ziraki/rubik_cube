/**
 * Node plumbing around `handleJev`: reading a body, enforcing its size, and
 * writing a response. Kept apart from the handler so the handler can be
 * tested without sockets, and so the same logic serves both the Vite dev
 * middleware and the standalone production server.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { LIMITS, handleJev, type JevDeps } from './jevHandler';

/** Read the body with a hard cap, destroying the socket if it is exceeded. */
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > LIMITS.bodyBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) { resolve(undefined); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Something stable enough to rate-limit by.
 *
 * `x-forwarded-for` is trusted only when `TRUST_PROXY` is set, because behind
 * no proxy it is a header any client can invent - and inventing it would mean
 * inventing a fresh rate-limit bucket per request.
 */
function clientId(req: IncomingMessage): string {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
    if (first?.trim()) return first.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Returns true when it has handled the request. */
export async function serveJev(
  req: IncomingMessage, res: ServerResponse, deps: JevDeps = {},
): Promise<boolean> {
  const url = req.url ?? '';
  const path = url.split('?')[0];
  if (!path.startsWith('/api/jev/')) return false;

  const send = (status: number, body: unknown): void => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      // Nothing here is cacheable and some of it is a learner's own words.
      'cache-control': 'no-store',
    });
    res.end(payload);
  };

  let body: unknown;
  if (req.method === 'POST') {
    try {
      body = await readBody(req);
    } catch (err) {
      send(413, { error: 'bad-request', detail: (err as Error).message });
      return true;
    }
  }

  // A caller's own key travels in a header, not the body, so it never lands in
  // a log line that prints a request payload.
  const header = req.headers['x-jev-key'];
  const callerKey = (Array.isArray(header) ? header[0] : header)?.trim() || undefined;

  const controller = new AbortController();
  // If the browser gives up, stop paying for the upstream call.
  req.on('aborted', () => controller.abort());

  const result = await handleJev({
    method: req.method ?? 'GET',
    path,
    body,
    callerKey,
    clientId: clientId(req),
    signal: controller.signal,
  }, deps);

  send(result.status, result.body);
  return true;
}
