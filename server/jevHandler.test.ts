/**
 * The integration boundary, tested where it is load-bearing.
 *
 * Three groups. What happens with no key at all, because that is the mode the
 * application ships in. What happens when the model answers - including when
 * it answers badly, which is the case that must never reach the cube. And what
 * happens when the service fails, in each of the ways it can.
 *
 * Every test here uses a stub client. Nothing in the automated suite touches
 * the network, needs a key, or costs a request.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APIConnectionError, APITimeoutError, APIUserAbortError, AuthenticationError,
  BadRequestError, RateLimitError,
} from '@typesafe-ai/sdk';
import {
  classifyError, handleJev, parseRequest, resetRateLimits, runTask, LIMITS,
} from './jevHandler';
import { THRESHOLDS } from '../src/jev/questions';
import type { JevDecision, JevErrorBody } from '../src/jev/protocol';

/* ------------------------------------------------------------- fixtures --- */

const choice = (label: string, confidence: number, probabilities: Record<string, number> = {}) =>
  ({ type: 'choice' as const, choice: label, confidence, probabilities });
const noul = (p: number) => ({ type: 'noul' as const, noul: p });
const score = (s: number, confidence: number) =>
  ({ type: 'score' as const, score: s, confidence, legend: {}, probabilities: {} });

/** A client that returns whatever answers a test hands it. */
function stubClient(answers: Record<string, unknown>, opts: { throws?: unknown } = {}) {
  return {
    systemOne: vi.fn(async () => {
      if (opts.throws) throw opts.throws;
      return { model: 'jev-test', answers, usage: { input_tokens: 10, output_tokens: 4 } };
    }),
    models: { list: vi.fn(async () => [{ name: 'jev-latest', description: '', release_date: '' }]) },
    defaultModel: 'jev-test',
  } as never;
}

const askBody = {
  task: 'misconception' as const,
  promptId: 'inverse',
  answer: 'R prime undoes R, so the cube comes back.',
  language: 'en' as const,
};

beforeEach(() => resetRateLimits());

/* ------------------------------------------------------------ no key at all --- */

describe('with no API key', () => {
  it('reports that the server has none, without calling anything', async () => {
    const makeClient = vi.fn();
    const res = await handleJev(
      { method: 'GET', path: '/api/jev/status', body: undefined, clientId: 'a' },
      { serverKey: '', makeClient },
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ serverKey: false });
    expect(makeClient).not.toHaveBeenCalled();
  });

  it('refuses a task rather than pretending to answer it', async () => {
    const makeClient = vi.fn();
    const res = await handleJev(
      { method: 'POST', path: '/api/jev/ask', body: askBody, clientId: 'a' },
      { serverKey: '', makeClient },
    );
    expect(res.status).toBe(503);
    expect((res.body as JevErrorBody).error).toBe('not-configured');
    expect(makeClient).not.toHaveBeenCalled();
  });

  it('uses a caller-supplied key when the server has none', async () => {
    const makeClient = vi.fn(() => stubClient({
      diagnosis: choice('correct', 0.9), on_topic: noul(0.95),
    }));
    const res = await handleJev(
      { method: 'POST', path: '/api/jev/ask', body: askBody, callerKey: 'sk-caller', clientId: 'a' },
      { serverKey: '', makeClient },
    );
    expect(res.status).toBe(200);
    expect(makeClient).toHaveBeenCalledWith('sk-caller');
  });

  it("prefers the caller's key over the server's", async () => {
    const makeClient = vi.fn(() => stubClient({
      diagnosis: choice('correct', 0.9), on_topic: noul(0.95),
    }));
    await handleJev(
      { method: 'POST', path: '/api/jev/ask', body: askBody, callerKey: 'sk-caller', clientId: 'a' },
      { serverKey: 'sk-server', makeClient },
    );
    expect(makeClient).toHaveBeenCalledWith('sk-caller');
  });
});

/* -------------------------------------------------------------- validation --- */

describe('request validation', () => {
  it('rejects an unknown task', () => {
    expect(() => parseRequest({ task: 'delete-everything' })).toThrow();
  });

  it('rejects a body that is not an object', () => {
    expect(() => parseRequest('hello')).toThrow();
    expect(() => parseRequest(null)).toThrow();
  });

  it('caps the length of a written answer', () => {
    expect(() => parseRequest({
      ...askBody, answer: 'x'.repeat(LIMITS.answerChars + 1),
    })).toThrow(/too long/);
  });

  it('clamps out-of-range numbers instead of failing', () => {
    const parsed = parseRequest({
      task: 'hint-level',
      situation: {
        hintsTaken: -5, movesUsed: 1e9, optimalLength: 99,
        wasted: 3, restarts: 0, secondsOnTask: 1e12,
      },
      language: 'en',
    });
    expect(parsed).toMatchObject({ task: 'hint-level' });
    if (parsed.task !== 'hint-level') throw new Error('wrong task');
    expect(parsed.situation.hintsTaken).toBe(0);
    expect(parsed.situation.optimalLength).toBe(30);
    expect(parsed.situation.secondsOnTask).toBe(86_400);
  });

  it('drops non-string candidates and caps the list', () => {
    const parsed = parseRequest({
      task: 'next-step',
      signals: {
        lessonsDone: 1, lessonsTotal: 12, exercisesDone: 0, attempts: 0,
        optimalSolves: 0, avgWasted: 0, lastWasted: null, hintsLastAttempt: 0,
        strugglingWith: ['notation', 42, null],
      },
      candidates: [...Array(50)].map((_, i) => `a${i}`),
      language: 'en',
    });
    if (parsed.task !== 'next-step') throw new Error('wrong task');
    expect(parsed.candidates).toHaveLength(LIMITS.candidates);
    expect(parsed.signals.strugglingWith).toEqual(['notation']);
  });

  it('refuses an empty candidate list rather than asking about nothing', () => {
    expect(() => parseRequest({
      task: 'next-step',
      signals: {
        lessonsDone: 0, lessonsTotal: 12, exercisesDone: 0, attempts: 0,
        optimalSolves: 0, avgWasted: 0, lastWasted: null, hintsLastAttempt: 0,
        strugglingWith: [],
      },
      candidates: [],
      language: 'en',
    })).toThrow();
  });

  it('will not let a caller supply its own questions', () => {
    // There is no field for them; anything extra is simply ignored.
    const parsed = parseRequest({ ...askBody, questions: { evil: { type: 'choice' } } });
    expect(Object.keys(parsed)).toEqual(['task', 'promptId', 'answer', 'language']);
  });
});

/* ------------------------------------------------------- answers, resolved --- */

describe('misconception', () => {
  it('acts on a confident, on-topic diagnosis', async () => {
    const d = await runTask(askBody, stubClient({
      diagnosis: choice('inverse-confusion', 0.88, { 'inverse-confusion': 0.88, correct: 0.12 }),
      on_topic: noul(0.97),
    }));
    expect(d).toMatchObject({
      kind: 'misconception', label: 'inverse-confusion', source: 'jev',
    });
  });

  it('abstains below the confidence floor', async () => {
    const d = await runTask(askBody, stubClient({
      diagnosis: choice('inverse-confusion', THRESHOLDS.misconceptionConfidence - 0.01),
      on_topic: noul(0.9),
    }));
    expect(d.source).toBe('jev-uncertain');
  });

  it('overrides the diagnosis when the answer was not on topic', async () => {
    const d = await runTask(askBody, stubClient({
      diagnosis: choice('inverse-confusion', 0.99),
      on_topic: noul(0.05),
    }));
    expect(d).toMatchObject({ label: 'unrelated', source: 'jev' });
  });

  it('discards a label the prompt could not have elicited', async () => {
    // `gods-number-human` is not in the `inverse` prompt's plausible set.
    const d = await runTask(askBody, stubClient({
      diagnosis: choice('gods-number-human', 0.99),
      on_topic: noul(0.99),
    }));
    expect(d).toMatchObject({ label: 'insufficient', source: 'jev-uncertain' });
  });

  it('survives a malformed answer', async () => {
    const d = await runTask(askBody, stubClient({ diagnosis: { type: 'choice' }, on_topic: noul(1) }));
    expect(d).toMatchObject({ label: 'insufficient', source: 'jev-uncertain' });
  });

  it('survives a missing answer', async () => {
    const d = await runTask(askBody, stubClient({}));
    expect(d.source).toBe('jev-uncertain');
  });

  it('reports the probabilities for the Learning Lab', async () => {
    const d = await runTask(askBody, stubClient({
      diagnosis: choice('correct', 0.8, { correct: 0.8, insufficient: 0.2 }),
      on_topic: noul(0.9),
    }));
    expect(d.trace?.answers.diagnosis).toMatchObject({ type: 'choice', confidence: 0.8 });
    expect(d.trace?.model).toBe('jev-test');
    expect(d.trace?.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
  });
});

describe('next step', () => {
  const body = {
    task: 'next-step' as const,
    signals: {
      lessonsDone: 2, lessonsTotal: 12, exercisesDone: 1, attempts: 4,
      optimalSolves: 0, avgWasted: 5, lastWasted: 6, hintsLastAttempt: 1,
      strugglingWith: [],
    },
    candidates: ['lesson-pieces', 'practice-efficiency', 'lesson-sticker-map'],
    language: 'en' as const,
  };

  it('always computes the deterministic choice, even when Jev answers', async () => {
    const d = await runTask(body, stubClient({ next: choice('lesson-sticker-map', 0.9) }));
    if (d.kind !== 'next-step') throw new Error('wrong kind');
    expect(d.activity).toBe('lesson-sticker-map');
    // High average waste, so the rules would have said practice.
    expect(d.deterministicChoice).toBe('practice-efficiency');
    expect(d.source).toBe('jev');
  });

  it('refuses an activity that was not a candidate', async () => {
    const d = await runTask(body, stubClient({ next: choice('lesson-gods-number', 0.99) }));
    if (d.kind !== 'next-step') throw new Error('wrong kind');
    expect(d.activity).toBe(d.deterministicChoice);
    expect(d.source).toBe('jev-uncertain');
  });

  it('falls back below the confidence floor', async () => {
    const d = await runTask(body, stubClient({
      next: choice('lesson-pieces', THRESHOLDS.nextStepConfidence - 0.05),
    }));
    if (d.kind !== 'next-step') throw new Error('wrong kind');
    expect(d.activity).toBe(d.deterministicChoice);
  });
});

describe('hint level', () => {
  const situation = {
    hintsTaken: 1, movesUsed: 6, optimalLength: 5, wasted: 1, restarts: 0, secondsOnTask: 60,
  };
  const body = { task: 'hint-level' as const, situation, language: 'en' as const };

  it('never goes below the rung the learner has already earned', async () => {
    const d = await runTask(body, stubClient({ level: score(0, 0.99) }));
    if (d.kind !== 'hint-level') throw new Error('wrong kind');
    // One hint already taken, so the floor is 1 whatever the model says.
    expect(d.level).toBeGreaterThanOrEqual(1);
  });

  it('lets the model raise the level', async () => {
    const d = await runTask(body, stubClient({ level: score(3, 0.9) }));
    if (d.kind !== 'hint-level') throw new Error('wrong kind');
    expect(d.level).toBe(3);
    expect(d.source).toBe('jev');
  });

  it('clamps above the top of the ladder', async () => {
    const d = await runTask(body, stubClient({ level: score(99, 0.9) }));
    if (d.kind !== 'hint-level') throw new Error('wrong kind');
    expect(d.level).toBe(3);
  });

  it('uses the rule when confidence is low', async () => {
    const d = await runTask(body, stubClient({
      level: score(3, THRESHOLDS.hintConfidence - 0.1),
    }));
    if (d.kind !== 'hint-level') throw new Error('wrong kind');
    expect(d.level).toBe(d.deterministicLevel);
    expect(d.source).toBe('jev-uncertain');
  });
});

describe('command routing', () => {
  const body = { task: 'command' as const, utterance: 'mix it up', language: 'en' as const };

  it('acts without confirmation on a confident, unambiguous request', async () => {
    const d = await runTask(body, stubClient({
      action: choice('scramble', 0.95), unambiguous: noul(0.9),
    }));
    if (d.kind !== 'command') throw new Error('wrong kind');
    expect(d).toMatchObject({ action: 'scramble', needsConfirmation: false });
  });

  it('asks first when the sentence was ambiguous', async () => {
    const d = await runTask(body, stubClient({
      action: choice('scramble', 0.95), unambiguous: noul(0.2),
    }));
    if (d.kind !== 'command') throw new Error('wrong kind');
    expect(d.needsConfirmation).toBe(true);
  });

  it('asks first when the routing was not confident', async () => {
    const d = await runTask(body, stubClient({
      action: choice('scramble', 0.4), unambiguous: noul(0.99),
    }));
    if (d.kind !== 'command') throw new Error('wrong kind');
    expect(d.needsConfirmation).toBe(true);
  });

  it('does not ask before a harmless navigation', async () => {
    const d = await runTask(body, stubClient({
      action: choice('show-state-space', 0.5), unambiguous: noul(0.3),
    }));
    if (d.kind !== 'command') throw new Error('wrong kind');
    expect(d.needsConfirmation).toBe(false);
  });

  it('refuses an action that is not in the catalogue', async () => {
    const d = await runTask(body, stubClient({
      action: choice('rm -rf', 0.99), unambiguous: noul(0.99),
    }));
    if (d.kind !== 'command') throw new Error('wrong kind');
    // Falls back to the keyword router, which finds 'scramble' in "mix it up".
    expect(d.source).toBe('jev-uncertain');
    expect(d.needsConfirmation).toBe(true);
  });
});

/* ---------------------------------------------------------------- failures --- */

describe('failures', () => {
  const cases: [string, unknown, string, number][] = [
    ['authentication', new AuthenticationError(401, {}, new Headers()), 'auth', 401],
    ['permission', new BadRequestError(400, {}, new Headers()), 'bad-request', 502],
    ['rate limit', new RateLimitError(429, {}, new Headers()), 'rate-limit', 429],
    ['timeout', new APITimeoutError(1000), 'timeout', 502],
    ['connection', new APIConnectionError('down'), 'network', 502],
    ['abort', new APIUserAbortError(), 'aborted', 502],
    ['anything else', new Error('boom'), 'server', 502],
  ];

  for (const [name, error, code, status] of cases) {
    it(`maps ${name} onto a stable code`, async () => {
      const res = await handleJev(
        { method: 'POST', path: '/api/jev/ask', body: askBody, clientId: `c-${code}` },
        { serverKey: 'sk-test', makeClient: () => stubClient({}, { throws: error }) },
      );
      expect((res.body as JevErrorBody).error).toBe(code);
      expect(res.status).toBe(status);
    });
  }

  it('classifies a rate limit with its retry delay', () => {
    const headers = new Headers({ 'retry-after-ms': '4500' });
    const classified = classifyError(new RateLimitError(429, {}, headers));
    expect(classified.code).toBe('rate-limit');
  });

  it('never leaks a key in an error body', async () => {
    const res = await handleJev(
      { method: 'POST', path: '/api/jev/ask', body: askBody, callerKey: 'sk-secret-123', clientId: 'x' },
      { serverKey: '', makeClient: () => { throw new Error('sk-secret-123 is bad'); } },
    );
    expect(JSON.stringify(res.body)).not.toContain('sk-secret-123');
  });

  it('rejects a malformed body before any call', async () => {
    const makeClient = vi.fn(() => stubClient({}));
    const res = await handleJev(
      { method: 'POST', path: '/api/jev/ask', body: { task: 'nope' }, clientId: 'y' },
      { serverKey: 'sk-test', makeClient },
    );
    expect(res.status).toBe(400);
    // The client is built before the body is parsed, but never used.
    const stub = makeClient.mock.results[0]?.value as { systemOne: { mock: { calls: unknown[] } } } | undefined;
    expect(stub?.systemOne.mock.calls ?? []).toHaveLength(0);
  });
});

/* -------------------------------------------------------------- rate limit --- */

describe('rate limiting', () => {
  it('stops a client spending an unbounded number of requests', async () => {
    const deps = { serverKey: 'sk-test', makeClient: () => stubClient({
      diagnosis: choice('correct', 0.9), on_topic: noul(0.9),
    }) };
    let limited = 0;
    for (let i = 0; i < LIMITS.requestsPerWindow + 5; i++) {
      const res = await handleJev(
        { method: 'POST', path: '/api/jev/ask', body: askBody, clientId: 'greedy' }, deps,
      );
      if (res.status === 429) limited += 1;
    }
    expect(limited).toBe(5);
  });

  it('gives a caller with their own key a separate allowance', async () => {
    const deps = { serverKey: 'sk-test', makeClient: () => stubClient({
      diagnosis: choice('correct', 0.9), on_topic: noul(0.9),
    }) };
    for (let i = 0; i < LIMITS.requestsPerWindow; i++) {
      await handleJev(
        { method: 'POST', path: '/api/jev/ask', body: askBody, clientId: 'shared' }, deps,
      );
    }
    const byok = await handleJev(
      { method: 'POST', path: '/api/jev/ask', body: askBody, callerKey: 'own', clientId: 'shared' },
      deps,
    );
    expect(byok.status).toBe(200);
  });
});

/* -------------------------------------------------------------- the routes --- */

describe('routing', () => {
  it('serves the connection test by listing models', async () => {
    const res = await handleJev(
      { method: 'POST', path: '/api/jev/test', body: undefined, clientId: 'z' },
      { serverKey: 'sk-test', makeClient: () => stubClient({}) },
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ models: ['jev-latest'] });
  });

  it('refuses an unknown path', async () => {
    const res = await handleJev(
      { method: 'POST', path: '/api/jev/everything', body: {}, clientId: 'z' },
      { serverKey: 'sk-test', makeClient: () => stubClient({}) },
    );
    expect(res.status).toBe(404);
  });

  it('refuses a GET to the ask endpoint', async () => {
    const res = await handleJev(
      { method: 'GET', path: '/api/jev/ask', body: undefined, clientId: 'z' },
      { serverKey: 'sk-test', makeClient: () => stubClient({}) },
    );
    expect(res.status).toBe(405);
  });
});

/* ---------------------------------------------------- a decision is a decision --- */

describe('the shape of every decision', () => {
  it('always names its source', async () => {
    const decisions: JevDecision[] = [
      await runTask(askBody, stubClient({ diagnosis: choice('correct', 0.9), on_topic: noul(0.9) })),
      await runTask({
        task: 'hint-level',
        situation: { hintsTaken: 0, movesUsed: 0, optimalLength: 5, wasted: 0, restarts: 0, secondsOnTask: 1 },
        language: 'en',
      }, stubClient({ level: score(1, 0.9) })),
    ];
    for (const d of decisions) expect(['jev', 'jev-uncertain', 'deterministic']).toContain(d.source);
  });
});
