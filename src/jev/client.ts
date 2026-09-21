/**
 * The browser's half of the integration.
 *
 * It knows one endpoint and four task names. It does not know what a question
 * is, cannot ask for one, and never holds a key for longer than the fetch it
 * is attached to.
 *
 * Two protections matter more than anything else here, because both are ways
 * an answer can end up attached to the wrong thing:
 *
 *  - every request carries an `AbortSignal`, so abandoning an exercise stops
 *    the call rather than leaving it to land later;
 *  - every request carries a caller-supplied token, and the caller checks it
 *    against its own current token before applying the result. A response to
 *    the previous exercise must never be used to judge this one.
 */

import { getJevConfig, jevActive } from './config';
import type {
  JevDecision, JevErrorBody, JevErrorCode, JevRequest, JevStatusBody,
} from './protocol';

export class JevError extends Error {
  readonly code: JevErrorCode;
  readonly retryAfter?: number;
  constructor(code: JevErrorCode, retryAfter?: number) {
    super(code);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/** Headers for a request, including a session key when the learner supplied one. */
function headers(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  const key = getJevConfig().sessionKey;
  if (key) h['x-jev-key'] = key;
  return h;
}

const isErrorBody = (v: unknown): v is JevErrorBody =>
  typeof v === 'object' && v !== null && typeof (v as { error?: unknown }).error === 'string';

/**
 * Ask the server to run a task.
 *
 * Throws `JevError` for anything that went wrong, including being switched
 * off - callers treat every failure the same way, by falling back to the
 * deterministic path, so there is nothing to be gained from them all
 * distinguishing a timeout from a rate limit except the message they show.
 */
export async function askJev(
  request: JevRequest, signal?: AbortSignal,
): Promise<JevDecision> {
  if (!jevActive()) throw new JevError('disabled');

  let response: Response;
  try {
    response = await fetch('/api/jev/ask', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new JevError('aborted');
    throw new JevError('network');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new JevError('unexpected-response');
  }

  if (!response.ok) {
    if (isErrorBody(body)) throw new JevError(body.error, body.retryAfter);
    throw new JevError('server');
  }

  if (typeof body !== 'object' || body === null || !('kind' in body)) {
    throw new JevError('unexpected-response');
  }
  return body as JevDecision;
}

/**
 * Ask the server whether it has a key. Cheap, makes no upstream call, and is
 * the only request the application sends without being asked to.
 */
export async function probeJevStatus(signal?: AbortSignal): Promise<JevStatusBody> {
  const response = await fetch('/api/jev/status', { signal });
  if (!response.ok) throw new JevError('server');
  return (await response.json()) as JevStatusBody;
}

/** The explicit connection test. Lists models, which proves the key works. */
export async function testJevConnection(signal?: AbortSignal): Promise<JevStatusBody> {
  let response: Response;
  try {
    response = await fetch('/api/jev/test', { method: 'POST', headers: headers(), signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new JevError('aborted');
    throw new JevError('network');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isErrorBody(body)) throw new JevError(body.error, body.retryAfter);
    throw new JevError('server');
  }
  return body as JevStatusBody;
}
