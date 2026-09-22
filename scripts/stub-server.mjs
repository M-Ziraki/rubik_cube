#!/usr/bin/env node
/**
 * Cube Atlas with a stubbed Jev, for browser verification without a key.
 *
 * It serves the real production build and the real endpoint code, and swaps
 * only the innermost piece: the object that would talk to TypeSafe. Everything
 * between the browser and that object - routing, validation, thresholds,
 * fallbacks, rate limiting, error mapping - is the code that ships.
 *
 *   node scripts/stub-server.mjs            # plausible answers
 *   node scripts/stub-server.mjs --failing  # every call fails
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';

const failing = process.argv.includes('--failing');
const PORT = Number(process.env.PORT ?? 4180);
const ROOT = resolve(process.cwd(), 'dist');

// Load the real handler through Vite, so it is the TypeScript that ships.
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'custom' });
const { handleJev } = await vite.ssrLoadModule('/server/jevHandler.ts');

/** Answers chosen to exercise the interesting branches, not to look clever. */
function stubAnswers(body) {
  if (body?.task === 'misconception') {
    const text = String(body.answer ?? '').toLowerCase();
    const label = /same move|like r2|180/.test(text) ? 'inverse-confusion'
      : /zoom|each of the 54|one of the possible/.test(text) ? 'sticker-vs-state'
        : /algorithms.*20|speedcub/.test(text) ? 'gods-number-human'
          : /exactly 18|shortest/.test(text) ? 'any-vs-optimal'
            : /opposite|inverse|undo/.test(text) ? 'correct'
              : 'insufficient';
    return {
      diagnosis: {
        type: 'choice', choice: label, confidence: 0.86,
        probabilities: { [label]: 0.86, correct: 0.09, insufficient: 0.05 },
      },
      on_topic: { type: 'noul', noul: text.length > 12 ? 0.95 : 0.4 },
    };
  }
  if (body?.task === 'next-step') {
    const pick = body.candidates?.[body.candidates.length - 1] ?? body.candidates?.[0];
    const probabilities = {};
    for (const c of body.candidates ?? []) probabilities[c] = c === pick ? 0.62 : 0.38 / Math.max(1, body.candidates.length - 1);
    // Three independent answers in one response, as the real service returns
    // them, so the plan composition is exercised end to end.
    const done = body.signals?.lessonsDone ?? 0;
    return {
      next: { type: 'choice', choice: pick, confidence: 0.62, probabilities },
      ready_to_practise: { type: 'noul', noul: done >= 4 ? 0.81 : 0.22 },
      support: {
        type: 'score',
        score: done >= 6 ? 0.9 : 2.2,
        confidence: 0.64,
        legend: {
          0: 'Working independently and efficiently.',
          1: 'Solving things but not cleanly.',
          2: 'Can follow the material but not yet apply it.',
          3: 'At the beginning, or something fundamental has not landed.',
        },
        probabilities: { 0: 0.1, 1: 0.3, 2: 0.4, 3: 0.2 },
      },
    };
  }
  if (body?.task === 'exercise') {
    const bands = body.bands ?? [3, 5, 7, 9, 11];
    const attempts = body.signals?.attempts ?? 0;
    const index = Math.min(bands.length - 1, attempts >= 6 ? 2 : attempts >= 2 ? 1 : 0);
    const wasted = body.signals?.avgWasted ?? 0;
    const focus = wasted >= 2 ? 'orientation' : attempts >= 4 ? 'placement' : 'mixed';
    return {
      difficulty: {
        type: 'score', score: index, confidence: 0.68,
        legend: Object.fromEntries(bands.map((n, i) => [i, `Set them ${n} moves from solved.`])),
        probabilities: Object.fromEntries(bands.map((_, i) => [i, i === index ? 0.68 : 0.08])),
      },
      focus: {
        type: 'choice', choice: focus, confidence: 0.74,
        probabilities: { [focus]: 0.74, mixed: 0.26 },
      },
    };
  }
  if (body?.task === 'stuck') {
    const text = String(body.description ?? '').toLowerCase();
    const vague = text.trim().split(/\s+/).length < 4 || /^(help|hard|lost|stuck)/.test(text);
    const offTopic = /weather|dinner|football|هوا/.test(text);
    const pick = /prime|backwards|which way|جهت/.test(text) ? 'lesson-notation'
      : /first layer|guess|plan|بعدش/.test(text) ? 'practice-efficiency'
        : /shortest|optimal|کوتاه/.test(text) ? 'compare-solvers'
          : (body.candidates ?? [])[0] ?? 'none';
    const choice = (body.candidates ?? []).includes(pick) ? pick : 'none';
    const probabilities = { [choice]: 0.78, none: 0.22 };
    return {
      activity: { type: 'choice', choice, confidence: 0.78, probabilities },
      on_topic: { type: 'noul', noul: offTopic ? 0.05 : 0.93 },
      specificity: {
        type: 'score',
        score: vague ? 0.3 : 1.8,
        confidence: 0.7,
        legend: { 0: 'General.', 1: 'A named area.', 2: 'A particular thing that goes wrong.' },
        probabilities: { 0: 0.2, 1: 0.3, 2: 0.5 },
      },
    };
  }
  if (body?.task === 'hint-level') {
    return {
      level: {
        type: 'score', score: 1.4, confidence: 0.71, legend: {},
        probabilities: { 0: 0.1, 1: 0.5, 2: 0.3, 3: 0.1 },
      },
    };
  }
  // command
  const text = String(body?.utterance ?? '').toLowerCase();
  const vague = /do the thing|something|it$/.test(text);
  const action = /state.?space|configuration graph|whole position/.test(text) ? 'show-state-space'
    : /54 sticker|flat|sticker map/.test(text) ? 'show-sticker-map'
      : /scramble|mix/.test(text) ? 'scramble'
        : /solve/.test(text) ? 'solve'
          : /inverse|undo each other|prime/.test(text) ? 'explain-inverse'
            : vague ? 'scramble' : 'none';
  return {
    action: {
      type: 'choice', choice: action, confidence: vague ? 0.44 : 0.93,
      probabilities: { [action]: vague ? 0.44 : 0.93, none: 0.07 },
    },
    unambiguous: { type: 'noul', noul: vague ? 0.18 : 0.9 },
  };
}

function stubClient() {
  if (failing) {
    return {
      systemOne: async () => { throw new Error('stub: upstream unavailable'); },
      models: { list: async () => { throw new Error('stub: upstream unavailable'); } },
      defaultModel: 'jev-stub',
    };
  }
  return {
    systemOne: async (request) => ({
      model: 'jev-stub',
      answers: stubAnswers(lastBody),
      usage: { input_tokens: 120, output_tokens: 8 },
      _request: request,
    }),
    models: { list: async () => [{ name: 'jev-stub', description: 'stub', release_date: '2026-01-01' }] },
    defaultModel: 'jev-stub',
  };
}

// The handler does not pass the parsed body to the client, so the stub reads
// it from here. Only a test harness would do this.
let lastBody = null;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

createServer((req, res) => {
  void (async () => {
    const path = (req.url ?? '/').split('?')[0];

    if (path.startsWith('/api/jev/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body;
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined; } catch { body = undefined; }
      lastBody = body;

      const result = await handleJev({
        method: req.method ?? 'GET',
        path,
        body,
        callerKey: req.headers['x-jev-key'],
        clientId: req.socket.remoteAddress ?? 'stub',
      }, { serverKey: 'sk-stub-key', makeClient: stubClient });

      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
      return;
    }

    let file = join(ROOT, path === '/' ? 'index.html' : path.slice(1));
    try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); }
    catch { file = join(ROOT, 'index.html'); }
    try { statSync(file); } catch { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  })();
}).listen(PORT, () => {
  process.stdout.write(`stub server on http://127.0.0.1:${PORT} (${failing ? 'failing' : 'answering'})\n`);
});
