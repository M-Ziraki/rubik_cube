/**
 * Cube Atlas's Jev endpoint: the only place an API key is ever held.
 *
 * The TypeSafe SDK refuses to run in a browser unless you pass
 * `dangerouslyAllowBrowser`, and it is right to: a key in a bundle is a key
 * anyone can read. So the browser talks to this handler instead, and this
 * handler talks to TypeSafe.
 *
 * Two things make it narrow rather than a general proxy. It accepts a *task
 * name*, not a question - the questions come from `src/jev/questions.ts` and
 * cannot be supplied, altered or added to by a caller. And every field of
 * every payload is validated and bounded before it is used, so the worst a
 * malformed request can do is be rejected.
 *
 * Mounted as Vite middleware in development and run standalone in production;
 * both paths call `handleJev`, so there is one implementation to reason about.
 */

import {
  APIConnectionError, APITimeoutError, APIUserAbortError, AuthenticationError,
  BadRequestError, PermissionDeniedError, RateLimitError, TypeSafeClient,
  type Questions, type SystemOneResult,
} from '@typesafe-ai/sdk';
import {
  commandQuestions, commandState, hintQuestions, hintState, misconceptionQuestions,
  misconceptionState, nextStepQuestions, nextStepState, stuckQuestions, stuckState,
  type QuestionSpec,
} from '../src/jev/questions';
import {
  eligibleActivities, planSecondStep, resolveCommand, resolveHintLevel,
  resolveMisconception, resolveNextStep, resolveStuck, ruleBasedCommand,
  ruleBasedHintLevel, ruleBasedNextStep,
} from '../src/jev/decisions';
import {
  COMMAND_ACTIONS, type CommandAction, type HintSituation, type JevDecision,
  type JevErrorBody, type JevErrorCode, type JevRequest, type JevStatusBody,
  type JevTrace, type LearnerSignals, type TracedAnswer,
} from '../src/jev/protocol';

/* ---------------------------------------------------------------- limits --- */

/** Bounds on anything a caller can influence. Generous for a person, tight for a script. */
const LIMITS = {
  bodyBytes: 8 * 1024,
  answerChars: 1200,
  utteranceChars: 300,
  candidates: 12,
  strugglingWith: 12,
  /** Requests allowed per window, per client, per key source. */
  requestsPerWindow: 30,
  windowMs: 60_000,
  /** Per-attempt timeout handed to the SDK. */
  timeoutMs: 12_000,
} as const;

/* ------------------------------------------------------------ rate limit --- */

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + LIMITS.windowMs });
    return false;
  }
  bucket.count += 1;
  // Keep the map from growing without bound on a long-lived server.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }
  return bucket.count > LIMITS.requestsPerWindow;
}

/** Exported for tests, which need a clean slate between cases. */
export function resetRateLimits(): void {
  buckets.clear();
}

/* ------------------------------------------------------------ validation --- */

class BadRequest extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function str(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new BadRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw new BadRequest(`${field} must not be empty`);
  if (trimmed.length > max) throw new BadRequest(`${field} is too long`);
  return trimmed;
}

function num(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequest(`${field} must be a number`);
  }
  return Math.min(max, Math.max(min, value));
}

function lang(value: unknown): 'en' | 'fa' {
  return value === 'fa' ? 'fa' : 'en';
}

/**
 * Turn an untrusted body into a request we are willing to act on.
 *
 * Every numeric field is clamped rather than rejected, because a learner's
 * counters drifting out of range is not worth an error; every string is
 * length-capped, because a long one is how you turn someone else's key into
 * your own token budget.
 */
export function parseRequest(body: unknown): JevRequest {
  if (!isRecord(body)) throw new BadRequest('body must be an object');
  const task = body.task;

  if (task === 'misconception') {
    return {
      task,
      promptId: str(body.promptId, 'promptId', 64),
      answer: str(body.answer, 'answer', LIMITS.answerChars),
      language: lang(body.language),
    };
  }

  if (task === 'next-step' || task === 'stuck') {
    const raw = body.signals;
    if (!isRecord(raw)) throw new BadRequest('signals must be an object');
    const struggling = Array.isArray(raw.strugglingWith)
      ? raw.strugglingWith.filter((x): x is string => typeof x === 'string')
        .slice(0, LIMITS.strugglingWith).map((x) => x.slice(0, 64))
      : [];
    const signals: LearnerSignals = {
      lessonsDone: num(raw.lessonsDone, 'lessonsDone', 0, 999),
      lessonsTotal: num(raw.lessonsTotal, 'lessonsTotal', 0, 999),
      exercisesDone: num(raw.exercisesDone, 'exercisesDone', 0, 9999),
      attempts: num(raw.attempts, 'attempts', 0, 99999),
      optimalSolves: num(raw.optimalSolves, 'optimalSolves', 0, 99999),
      avgWasted: num(raw.avgWasted, 'avgWasted', 0, 999),
      lastWasted: raw.lastWasted === null || raw.lastWasted === undefined
        ? null : num(raw.lastWasted, 'lastWasted', 0, 999),
      hintsLastAttempt: num(raw.hintsLastAttempt, 'hintsLastAttempt', 0, 99),
      strugglingWith: struggling,
    };
    if (!Array.isArray(body.candidates)) throw new BadRequest('candidates must be an array');
    const candidates = body.candidates
      .filter((x): x is string => typeof x === 'string')
      .slice(0, LIMITS.candidates);
    if (candidates.length === 0) throw new BadRequest('candidates must not be empty');
    if (task === 'stuck') {
      return {
        task,
        description: str(body.description, 'description', LIMITS.answerChars),
        signals,
        candidates,
        language: lang(body.language),
      };
    }
    return { task, signals, candidates, language: lang(body.language) };
  }

  if (task === 'hint-level') {
    const raw = body.situation;
    if (!isRecord(raw)) throw new BadRequest('situation must be an object');
    const situation: HintSituation = {
      hintsTaken: num(raw.hintsTaken, 'hintsTaken', 0, 99),
      movesUsed: num(raw.movesUsed, 'movesUsed', 0, 9999),
      optimalLength: num(raw.optimalLength, 'optimalLength', 0, 30),
      wasted: num(raw.wasted, 'wasted', 0, 9999),
      restarts: num(raw.restarts, 'restarts', 0, 999),
      secondsOnTask: num(raw.secondsOnTask, 'secondsOnTask', 0, 86_400),
    };
    return { task, situation, language: lang(body.language) };
  }

  if (task === 'command') {
    return {
      task,
      utterance: str(body.utterance, 'utterance', LIMITS.utteranceChars),
      language: lang(body.language),
    };
  }

  throw new BadRequest('unknown task');
}

/* --------------------------------------------------- response validation --- */

/**
 * Read one answer out of a result, checking its shape before trusting it.
 *
 * The SDK types promise this shape, but types are a compile-time promise about
 * a run-time value that arrived over a network. A malformed answer here must
 * fall back to the deterministic rule, never reach the application, and above
 * all never reach the cube.
 */
function readChoice(
  answers: Record<string, unknown>, name: string,
): { choice: string; confidence: number; probabilities: Record<string, number> } | null {
  const a = answers[name];
  if (!isRecord(a) || a.type !== 'choice') return null;
  if (typeof a.choice !== 'string') return null;
  const confidence = typeof a.confidence === 'number' && Number.isFinite(a.confidence)
    ? Math.min(1, Math.max(0, a.confidence)) : 0;
  const probabilities: Record<string, number> = {};
  if (isRecord(a.probabilities)) {
    for (const [k, v] of Object.entries(a.probabilities)) {
      if (typeof v === 'number' && Number.isFinite(v)) probabilities[k] = v;
    }
  }
  return { choice: a.choice, confidence, probabilities };
}

function readScore(
  answers: Record<string, unknown>, name: string,
): {
  score: number; confidence: number; probabilities: Record<string, number>;
  legend: Record<string, string>;
} | null {
  const a = answers[name];
  if (!isRecord(a) || a.type !== 'score') return null;
  if (typeof a.score !== 'number' || !Number.isFinite(a.score)) return null;
  const confidence = typeof a.confidence === 'number' && Number.isFinite(a.confidence)
    ? Math.min(1, Math.max(0, a.confidence)) : 0;
  const probabilities: Record<string, number> = {};
  if (isRecord(a.probabilities)) {
    for (const [k, v] of Object.entries(a.probabilities)) {
      if (typeof v === 'number' && Number.isFinite(v)) probabilities[k] = v;
    }
  }
  // The rubric comes back with the answer. Showing the model's own wording for
  // the level it picked is more honest than restating it in ours, and it costs
  // nothing: it is the text we sent, echoed against the level chosen.
  const legend: Record<string, string> = {};
  if (isRecord(a.legend)) {
    for (const [k, v] of Object.entries(a.legend)) {
      if (typeof v === 'string') legend[k] = v.slice(0, 400);
    }
  }
  return { score: a.score, confidence, probabilities, legend };
}

/** The rubric line for a rounded score, when the model returned one. */
function legendOf(
  answer: { legend: Record<string, string> }, level: number,
): string | undefined {
  return answer.legend[String(level)];
}

function readNoul(answers: Record<string, unknown>, name: string): number | null {
  const a = answers[name];
  if (!isRecord(a) || a.type !== 'noul') return null;
  if (typeof a.noul !== 'number' || !Number.isFinite(a.noul)) return null;
  return Math.min(1, Math.max(0, a.noul));
}

/** Normalize answers for the Learning Lab, dropping anything unrecognised. */
function traceOf(result: SystemOneResult<Questions>, millis: number): JevTrace {
  const answers: Record<string, TracedAnswer> = {};
  for (const [name, raw] of Object.entries(result.answers as Record<string, unknown>)) {
    if (!isRecord(raw)) continue;
    if (raw.type === 'choice') {
      const a = readChoice({ [name]: raw }, name);
      if (a) answers[name] = { type: 'choice', ...a };
    } else if (raw.type === 'score') {
      const a = readScore({ [name]: raw }, name);
      if (a) answers[name] = { type: 'score', ...a };
    } else if (raw.type === 'noul') {
      const n = readNoul({ [name]: raw }, name);
      if (n !== null) answers[name] = { type: 'noul', noul: n };
    }
  }
  return {
    model: result.model,
    usage: {
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
    },
    millis,
    answers,
  };
}

/* ----------------------------------------------------------------- calls --- */

/** What the handler needs from the outside world, so tests can supply their own. */
export interface JevDeps {
  /** Reads `TYPESAFE_API_KEY` in production; a fixture in tests. */
  serverKey?: string;
  /** Builds a client. Swapped for a stub in tests so no network is touched. */
  makeClient?: (apiKey: string) => Pick<TypeSafeClient, 'systemOne' | 'models' | 'defaultModel'>;
  now?: () => number;
}

function defaultClient(apiKey: string): TypeSafeClient {
  return new TypeSafeClient({
    apiKey,
    timeout: LIMITS.timeoutMs,
    // `debug` logs request bodies, which would put learners' words in the
    // server log. Never raise this without deciding that is acceptable.
    logLevel: 'warn',
  });
}

/** Map an SDK error onto a stable code the UI can translate. Never leaks a key. */
export function classifyError(err: unknown): { code: JevErrorCode; retryAfter?: number } {
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    return { code: 'auth' };
  }
  if (err instanceof RateLimitError) {
    return {
      code: 'rate-limit',
      retryAfter: err.retryAfterMs === undefined ? undefined : Math.ceil(err.retryAfterMs / 1000),
    };
  }
  if (err instanceof APITimeoutError) return { code: 'timeout' };
  if (err instanceof APIUserAbortError) return { code: 'aborted' };
  if (err instanceof APIConnectionError) return { code: 'network' };
  if (err instanceof BadRequestError) return { code: 'bad-request' };
  return { code: 'server' };
}

/**
 * Run one task.
 *
 * The deterministic answer is computed *first*, every time, for two reasons:
 * it is what we fall back to, and the Learning Lab shows it beside the model's
 * pick. A Jev answer is an override applied to a decision that already exists,
 * which is a different thing from a decision that only the model can make.
 */
export async function runTask(
  request: JevRequest,
  client: Pick<TypeSafeClient, 'systemOne'>,
  signal?: AbortSignal,
): Promise<JevDecision> {
  const started = Date.now();

  if (request.task === 'misconception') {
    const spec = misconceptionQuestions(request.promptId);
    const result = await ask(client, misconceptionState(
      request.promptId, request.answer, request.language,
    ), spec, signal);
    const trace = traceOf(result, Date.now() - started);
    const raw = result.answers as Record<string, unknown>;
    const diagnosis = readChoice(raw, 'diagnosis');
    const onTopic = readNoul(raw, 'on_topic');
    if (!diagnosis || onTopic === null) {
      return { kind: 'misconception', label: 'insufficient', source: 'jev-uncertain', trace };
    }
    const resolved = resolveMisconception(
      request.promptId, diagnosis.choice, diagnosis.confidence, onTopic,
    );
    return {
      kind: 'misconception',
      label: resolved.label,
      source: resolved.uncertain ? 'jev-uncertain' : 'jev',
      confidence: diagnosis.confidence,
      onTopic,
      trace,
    };
  }

  if (request.task === 'next-step') {
    const fallback = ruleBasedNextStep(request.signals, request.candidates);
    const spec = nextStepQuestions(request.candidates);
    const result = await ask(
      client, nextStepState(request.signals, request.candidates), spec, signal,
    );
    const trace = traceOf(result, Date.now() - started);
    const raw = result.answers as Record<string, unknown>;
    const next = readChoice(raw, 'next');
    // The two supporting judgments are optional in the strictest sense: a plan
    // missing them is still a plan, and a malformed answer must never cost the
    // learner the recommendation they asked for.
    const ready = readNoul(raw, 'ready_to_practise');
    const support = readScore(raw, 'support');
    const supportLevel = support ? Math.round(support.score) : null;

    if (!next) {
      return {
        kind: 'next-step', activity: fallback, source: 'jev-uncertain',
        deterministicChoice: fallback,
        thenActivity: planSecondStep(fallback, request.candidates, ready, supportLevel),
        readyToPractise: ready ?? undefined,
        support: supportLevel ?? undefined,
        trace,
      };
    }
    const resolved = resolveNextStep(next.choice, next.confidence, request.candidates, fallback);
    return {
      kind: 'next-step',
      activity: resolved.activity,
      source: resolved.used ? 'jev' : 'jev-uncertain',
      confidence: next.confidence,
      deterministicChoice: fallback,
      thenActivity: planSecondStep(resolved.activity, request.candidates, ready, supportLevel),
      readyToPractise: ready ?? undefined,
      support: supportLevel ?? undefined,
      supportLegend: supportLevel !== null && support
        ? legendOf(support, supportLevel) : undefined,
      trace,
    };
  }

  if (request.task === 'stuck') {
    // Always computed first, exactly as everywhere else: a learner who
    // described their difficulty gets an answer even if nothing else works.
    const fallback = ruleBasedNextStep(request.signals, request.candidates);
    const spec = stuckQuestions(request.candidates);
    const result = await ask(
      client,
      stuckState(request.description, request.signals, request.candidates),
      spec,
      signal,
    );
    const trace = traceOf(result, Date.now() - started);
    const raw = result.answers as Record<string, unknown>;
    const activity = readChoice(raw, 'activity');
    const onTopic = readNoul(raw, 'on_topic');
    const specificity = readScore(raw, 'specificity');
    if (!activity || onTopic === null || !specificity) {
      return {
        kind: 'stuck', activity: null, source: 'jev-uncertain',
        needsDetail: true, deterministicChoice: fallback, trace,
      };
    }
    const resolved = resolveStuck(
      activity.choice, activity.confidence, onTopic, specificity.score, request.candidates,
    );
    return {
      kind: 'stuck',
      activity: resolved.activity,
      source: resolved.used ? 'jev' : 'jev-uncertain',
      confidence: activity.confidence,
      onTopic,
      specificity: specificity.score,
      needsDetail: resolved.needsDetail,
      deterministicChoice: fallback,
      trace,
    };
  }

  if (request.task === 'hint-level') {
    const fallback = ruleBasedHintLevel(request.situation);
    const result = await ask(client, hintState(request.situation), hintQuestions(), signal);
    const trace = traceOf(result, Date.now() - started);
    const level = readScore(result.answers as Record<string, unknown>, 'level');
    if (!level) {
      return {
        kind: 'hint-level', level: fallback, source: 'jev-uncertain',
        deterministicLevel: fallback, trace,
      };
    }
    const resolved = resolveHintLevel(level.score, level.confidence, request.situation);
    return {
      kind: 'hint-level',
      level: resolved.level,
      source: resolved.used ? 'jev' : 'jev-uncertain',
      confidence: level.confidence,
      deterministicLevel: fallback,
      trace,
    };
  }

  const result = await ask(
    client, commandState(request.utterance, request.language), commandQuestions(), signal,
  );
  const trace = traceOf(result, Date.now() - started);
  const raw = result.answers as Record<string, unknown>;
  const action = readChoice(raw, 'action');
  const unambiguous = readNoul(raw, 'unambiguous');
  if (!action || unambiguous === null || !isCommandAction(action.choice)) {
    const fallback = ruleBasedCommand(request.utterance, request.language);
    return {
      kind: 'command', action: fallback, source: 'jev-uncertain',
      needsConfirmation: fallback !== 'none', trace,
    };
  }
  const resolved = resolveCommand(action.choice, action.confidence, unambiguous);
  return {
    kind: 'command',
    action: resolved.action,
    source: 'jev',
    confidence: action.confidence,
    unambiguous,
    needsConfirmation: resolved.needsConfirmation,
    trace,
  };
}

const isCommandAction = (v: string): v is CommandAction =>
  (COMMAND_ACTIONS as readonly string[]).includes(v);

/** The single place a question set becomes an API call. */
function ask(
  client: Pick<TypeSafeClient, 'systemOne'>,
  state: unknown,
  spec: QuestionSpec,
  signal?: AbortSignal,
): Promise<SystemOneResult<Questions>> {
  return client.systemOne(
    { state: state as never, questions: spec as unknown as Questions },
    { signal, timeout: LIMITS.timeoutMs },
  );
}

/* --------------------------------------------------------------- routing --- */

export interface HandlerRequest {
  method: string;
  path: string;
  /** Raw body, already read and size-checked by the transport. */
  body: unknown;
  /** A caller-supplied key, from `x-jev-key`. Session-only, never stored. */
  callerKey?: string;
  /** Something stable per client for rate limiting; an IP is fine. */
  clientId: string;
  signal?: AbortSignal;
}

export interface HandlerResponse {
  status: number;
  body: JevDecision | JevStatusBody | JevErrorBody;
}

const fail = (code: JevErrorCode, status: number, detail?: string, retryAfter?: number)
: HandlerResponse => ({ status, body: { error: code, detail, retryAfter } });

/**
 * The whole endpoint.
 *
 * `GET /api/jev/status` says whether the server has a key of its own, so the
 * browser can show the right configuration state without anybody spending a
 * request. `POST /api/jev/test` is the explicit connection test - it lists
 * models, the cheapest call that proves a key works. `POST /api/jev/ask` runs
 * a task.
 */
export async function handleJev(
  req: HandlerRequest, deps: JevDeps = {},
): Promise<HandlerResponse> {
  const serverKey = deps.serverKey ?? process.env.TYPESAFE_API_KEY?.trim() ?? '';
  const makeClient = deps.makeClient ?? defaultClient;
  const model = process.env.TYPESAFE_DEFAULT_MODEL?.trim() || 'jev-latest';

  if (req.method === 'GET' && req.path === '/api/jev/status') {
    return { status: 200, body: { serverKey: serverKey.length > 0, model } };
  }

  if (req.method !== 'POST') return fail('bad-request', 405, 'method not allowed');

  // A caller-supplied key beats the server's own, so a learner can bring their
  // own without the deployment paying for it.
  const apiKey = req.callerKey?.trim() || serverKey;
  if (!apiKey) return fail('not-configured', 503, 'no API key configured');

  // Rate limit per client *and* per key source: one noisy page cannot spend a
  // deployment's budget, and a caller's own key gets its own allowance.
  const source = req.callerKey ? 'byok' : 'server';
  if (rateLimited(`${source}:${req.clientId}`, deps.now?.() ?? Date.now())) {
    return fail('rate-limit', 429, 'too many requests', Math.ceil(LIMITS.windowMs / 1000));
  }

  let client: ReturnType<typeof makeClient>;
  try {
    client = makeClient(apiKey);
  } catch {
    // The SDK throws for a missing or malformed key before any network call.
    return fail('auth', 401, 'the API key was rejected by the client');
  }

  if (req.path === '/api/jev/test') {
    try {
      const models = await client.models.list({ signal: req.signal, timeout: LIMITS.timeoutMs });
      return {
        status: 200,
        body: { serverKey: serverKey.length > 0, model, models: models.map((m) => m.name) },
      };
    } catch (err) {
      const { code, retryAfter } = classifyError(err);
      return fail(code, code === 'auth' ? 401 : 502, undefined, retryAfter);
    }
  }

  if (req.path !== '/api/jev/ask') return fail('bad-request', 404, 'unknown path');

  let parsed: JevRequest;
  try {
    parsed = parseRequest(req.body);
  } catch (err) {
    return fail('bad-request', 400, err instanceof BadRequest ? err.message : 'invalid request');
  }

  try {
    return { status: 200, body: await runTask(parsed, client, req.signal) };
  } catch (err) {
    const { code, retryAfter } = classifyError(err);
    const status = code === 'auth' ? 401 : code === 'rate-limit' ? 429 : 502;
    return fail(code, status, undefined, retryAfter);
  }
}

export { LIMITS, eligibleActivities };
