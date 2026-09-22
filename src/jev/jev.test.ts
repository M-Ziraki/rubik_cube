/**
 * The browser half: what the application does with an answer, and what it does
 * without one.
 *
 * The deterministic tests matter most. They are what runs for every learner
 * who never configures anything, so a regression there is a regression in the
 * product rather than in an optional extra.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_HINT_LEVEL, eligibleActivities, planSecondStep, resolveCommand, resolveExercise,
  resolveHintLevel, resolveMisconception, resolveNextStep, resolveStuck, ruleBasedBand,
  ruleBasedCommand, ruleBasedHintLevel, ruleBasedNextStep,
} from './decisions';
import { matchesFocus } from './exercise';
import { CubieCube } from '../cube/cubie';
import { faceletString, fromFacelets, toFacelets } from '../cube/facelet';
import { parseSequence } from '../cube/notation';
import { report } from '../cube/analysis';
import {
  ACTIVITIES, MISCONCEPTION_PROMPTS, THRESHOLDS, commandQuestions, hintQuestions,
  misconceptionQuestions, misconceptionState, nextStepQuestions,
} from './questions';
import { COMMAND_ACTIONS, MISCONCEPTION_LABELS, type LearnerSignals } from './protocol';
import { hintLadder, REMEDIES } from './content';
import { TaskRunner } from './runner';
import { MOVE_NAMES, SOLVED_FACELETS } from '../cube/defs';

const signals = (patch: Partial<LearnerSignals> = {}): LearnerSignals => ({
  lessonsDone: 0, lessonsTotal: 12, exercisesDone: 0, attempts: 0, optimalSolves: 0,
  avgWasted: 0, lastWasted: null, hintsLastAttempt: 0, strugglingWith: [], ...patch,
});

/* ------------------------------------------------------- the catalogue --- */

describe('the question catalogue', () => {
  it('offers a way out of every choice question', () => {
    const q = misconceptionQuestions('inverse');
    if (q.diagnosis.type !== 'choice') throw new Error('wrong type');
    expect(Object.keys(q.diagnosis.criteria)).toContain('insufficient');
    expect(Object.keys(q.diagnosis.criteria)).toContain('unrelated');

    const c = commandQuestions();
    if (c.action.type !== 'choice') throw new Error('wrong type');
    expect(Object.keys(c.action.criteria)).toContain('none');
  });

  it('describes every label it offers', () => {
    for (const prompt of MISCONCEPTION_PROMPTS) {
      const q = misconceptionQuestions(prompt.id);
      if (q.diagnosis.type !== 'choice') throw new Error('wrong type');
      for (const [label, text] of Object.entries(q.diagnosis.criteria)) {
        expect(prompt.plausible).toContain(label as never);
        expect(text.length).toBeGreaterThan(40);
      }
    }
  });

  it('gives the score question at least two concrete levels', () => {
    const q = hintQuestions();
    if (q.level.type !== 'score') throw new Error('wrong type');
    expect(q.level.criteria.length).toBeGreaterThanOrEqual(2);
    expect(q.level.criteria.length).toBeLessThanOrEqual(10);
    for (const level of q.level.criteria) expect(String(level).length).toBeGreaterThan(40);
  });

  it('names every command action in the criteria', () => {
    const q = commandQuestions();
    if (q.action.type !== 'choice') throw new Error('wrong type');
    expect(Object.keys(q.action.criteria).sort()).toEqual([...COMMAND_ACTIONS].sort());
  });

  it('only ever offers activities that exist', () => {
    const q = nextStepQuestions(['lesson-notation', 'not-a-real-activity']);
    if (q.next.type !== 'choice') throw new Error('wrong type');
    expect(Object.keys(q.next.criteria)).toEqual(['lesson-notation']);
  });

  it('sends the learner text and nothing else', () => {
    const state = misconceptionState('inverse', 'my answer', 'fa');
    expect(Object.keys(state).sort()).toEqual(['learner_response', 'question', 'response_language']);
    expect(state.learner_response).toBe('my answer');
  });

  it('has a remedy for every label', () => {
    for (const label of MISCONCEPTION_LABELS) {
      expect(REMEDIES[label]).toBeDefined();
      expect(REMEDIES[label].explanation).toMatch(/^jev\./);
    }
  });
});

/* -------------------------------------------------- deterministic tutor --- */

describe('the rule-based tutor', () => {
  it('enforces prerequisites', () => {
    const eligible = eligibleActivities(signals(), []);
    // Nothing that needs notation is offered before notation is read.
    for (const id of eligible) {
      const activity = ACTIVITIES.find((a) => a.id === id);
      expect(activity?.requires ?? []).toHaveLength(0);
    }
    expect(eligible).toContain('lesson-notation');
    expect(eligible).not.toContain('lesson-distance');
  });

  it('opens up activities as lessons are finished', () => {
    const after = eligibleActivities(signals({ lessonsDone: 2 }), ['notation', 'graph']);
    expect(after).toContain('explore-state-space');
    expect(after).toContain('practice-efficiency');
    // Already read, and not struggled with, so not offered again.
    expect(after).not.toContain('lesson-notation');
  });

  it('re-offers a lesson the learner struggled with', () => {
    const eligible = eligibleActivities(
      signals({ strugglingWith: ['notation'] }), ['notation'],
    );
    expect(eligible).toContain('lesson-notation');
  });

  it('never returns an empty candidate list', () => {
    const everything = ACTIVITIES.map((a) => a.id.replace('lesson-', ''));
    expect(eligibleActivities(signals(), everything).length).toBeGreaterThan(0);
  });

  it('puts a struggled-with lesson before anything else', () => {
    const s = signals({ strugglingWith: ['notation'], avgWasted: 9, attempts: 5 });
    const candidates = eligibleActivities(s, ['notation']);
    expect(ruleBasedNextStep(s, candidates)).toBe('lesson-notation');
  });

  it('sends a wasteful solver to efficiency practice', () => {
    const s = signals({ attempts: 5, avgWasted: 6, lessonsDone: 3 });
    const candidates = ['practice-efficiency', 'lesson-graph'];
    expect(ruleBasedNextStep(s, candidates)).toBe('practice-efficiency');
  });

  it('otherwise works forward through the course', () => {
    const s = signals({ lessonsDone: 1 });
    expect(ruleBasedNextStep(s, ['lesson-pieces', 'practice-efficiency'])).toBe('lesson-pieces');
  });

  it('always returns something, even with an odd candidate list', () => {
    expect(ruleBasedNextStep(signals(), ['made-up'])).toBe('made-up');
    expect(ruleBasedNextStep(signals(), [])).toBe('lesson-notation');
  });
});

/* --------------------------------------------------------- resolution --- */

describe('resolving a diagnosis', () => {
  it('accepts a confident on-topic answer', () => {
    expect(resolveMisconception('inverse', 'inverse-confusion', 0.9, 0.9))
      .toEqual({ label: 'inverse-confusion', uncertain: false });
  });

  it('flags a low-confidence answer as uncertain but keeps the label', () => {
    const r = resolveMisconception('inverse', 'inverse-confusion', 0.2, 0.9);
    expect(r).toEqual({ label: 'inverse-confusion', uncertain: true });
  });

  it('calls an off-topic answer off-topic, whatever the diagnosis said', () => {
    expect(resolveMisconception('inverse', 'correct', 0.99, 0.01).label).toBe('unrelated');
  });

  it('discards a label the prompt cannot elicit', () => {
    expect(resolveMisconception('map-vs-graph', 'inverse-confusion', 0.99, 0.99))
      .toEqual({ label: 'insufficient', uncertain: true });
  });
});

describe('resolving a recommendation', () => {
  it('rejects a non-candidate', () => {
    expect(resolveNextStep('elsewhere', 0.99, ['a', 'b'], 'a'))
      .toEqual({ activity: 'a', used: false });
  });

  it('respects the confidence floor', () => {
    const below = THRESHOLDS.nextStepConfidence - 0.01;
    expect(resolveNextStep('b', below, ['a', 'b'], 'a').activity).toBe('a');
    expect(resolveNextStep('b', THRESHOLDS.nextStepConfidence, ['a', 'b'], 'a').activity).toBe('b');
  });
});

describe('resolving a hint level', () => {
  const base = {
    hintsTaken: 0, movesUsed: 0, optimalLength: 5, wasted: 0, restarts: 0, secondsOnTask: 5,
  };

  it('starts at the bottom for a fresh attempt', () => {
    expect(ruleBasedHintLevel(base)).toBe(0);
  });

  it('escalates on wasted moves, restarts and hints already taken', () => {
    expect(ruleBasedHintLevel({ ...base, wasted: 4 })).toBe(2);
    expect(ruleBasedHintLevel({ ...base, restarts: 2 })).toBe(2);
    expect(ruleBasedHintLevel({ ...base, hintsTaken: 2 })).toBe(MAX_HINT_LEVEL);
  });

  it('never lets a model take help away', () => {
    const stuck = { ...base, hintsTaken: 2 };
    // The rule floor is the top of the ladder; a low score cannot lower it.
    expect(resolveHintLevel(0, 0.99, stuck).level).toBe(MAX_HINT_LEVEL);
  });

  it('lets a model add help', () => {
    expect(resolveHintLevel(3, 0.9, base).level).toBe(3);
  });

  it('stays on the ladder', () => {
    expect(resolveHintLevel(99, 0.9, base).level).toBe(MAX_HINT_LEVEL);
    expect(resolveHintLevel(-5, 0.9, base).level).toBeGreaterThanOrEqual(0);
  });
});

describe('resolving a command', () => {
  it('protects the cube behind two separate bars', () => {
    expect(resolveCommand('scramble', 0.99, 0.99).needsConfirmation).toBe(false);
    expect(resolveCommand('scramble', 0.99, 0.1).needsConfirmation).toBe(true);
    expect(resolveCommand('scramble', 0.1, 0.99).needsConfirmation).toBe(true);
  });

  it('does not gate navigation', () => {
    expect(resolveCommand('show-state-space', 0.2, 0.2).needsConfirmation).toBe(false);
  });

  it('treats "none" as a non-action', () => {
    expect(resolveCommand('none', 0.99, 0.99))
      .toEqual({ action: 'none', needsConfirmation: false });
  });
});

/* --------------------------------------------------- the keyword router --- */

describe('the keyword router', () => {
  it('routes plain English', () => {
    expect(ruleBasedCommand('scramble the cube', 'en')).toBe('scramble');
    expect(ruleBasedCommand('reset it please', 'en')).toBe('reset');
    expect(ruleBasedCommand('open training', 'en')).toBe('open-training');
  });

  it('routes plain Persian', () => {
    expect(ruleBasedCommand('مکعب را به‌هم بریز', 'fa')).toBe('scramble');
    expect(ruleBasedCommand('تمرین را باز کن', 'fa')).toBe('open-training');
  });

  it('abstains rather than guessing', () => {
    expect(ruleBasedCommand('what is the weather', 'en')).toBe('none');
    expect(ruleBasedCommand('', 'en')).toBe('none');
    expect(ruleBasedCommand('   ', 'en')).toBe('none');
  });

  it('abstains when several actions match', () => {
    // Both 'scramble' and 'solve' appear, so there is no single right answer.
    expect(ruleBasedCommand('scramble it then solve it', 'en')).toBe('none');
  });
});

/* -------------------------------------------------------- the hint ladder --- */

describe('the hint ladder', () => {
  it('builds four rungs for every move', () => {
    for (let move = 0; move < 18; move++) {
      const ladder = hintLadder(move);
      expect(ladder).toHaveLength(MAX_HINT_LEVEL + 1);
      expect(ladder.map((h) => h.level)).toEqual([0, 1, 2, 3]);
    }
  });

  it('reveals the move only on the last rung', () => {
    const ladder = hintLadder(3);
    expect(ladder.filter((h) => h.revealsMove)).toHaveLength(1);
    expect(ladder[3].revealsMove).toBe(true);
    expect(ladder[3].params.move).toBe(MOVE_NAMES[3]);
  });

  it('highlights exactly the twenty stickers a turn moves', () => {
    for (let move = 0; move < 18; move++) {
      expect(hintLadder(move)[1].emphasis).toHaveLength(20);
    }
  });

  it('names the right concept for the kind of turn', () => {
    // R is a quarter turn of a side face, so it flips edges.
    expect(hintLadder(3).map((h) => h.key)).toContain('jev.hint.conceptOrientation');
    // U2 is a half turn, so it only rearranges.
    expect(hintLadder(1).map((h) => h.key)).toContain('jev.hint.conceptPermutation');
  });
});

/* -------------------------------------------------- config and transport --- */

describe('configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    const store = new Map<string, string>();
    const session = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, v: string) => session.set(k, v),
      removeItem: (k: string) => session.delete(k),
    });
  });

  it('is off until a key exists and the switch is on', async () => {
    const { getJevConfig, jevActive, jevConfig } = await import('./config');
    expect(jevActive(getJevConfig())).toBe(false);
    jevConfig.setEnabled(true);
    expect(jevActive(getJevConfig())).toBe(false); // still no key
    jevConfig.setServerStatus(true, 'jev-latest');
    expect(jevActive(getJevConfig())).toBe(true);
  });

  it('keeps a learner key out of localStorage', async () => {
    const { jevConfig } = await import('./config');
    jevConfig.setSessionKey('sk-secret');
    expect(sessionStorage.getItem('cube-atlas.jev.key.v1')).toBe('sk-secret');
    expect(localStorage.getItem('cube-atlas.jev.key.v1')).toBeNull();
    // ...and nothing else in localStorage holds it either.
    expect(JSON.stringify([...Object.values(localStorage)])).not.toContain('sk-secret');
  });

  it('persists the switch but not the secret', async () => {
    const { jevConfig } = await import('./config');
    jevConfig.setEnabled(true);
    jevConfig.setSessionKey('sk-secret');
    expect(localStorage.getItem('cube-atlas.jev.enabled.v1')).toBe('1');
  });

  it('forgets a cleared key', async () => {
    const { getJevConfig, jevConfig } = await import('./config');
    jevConfig.setSessionKey('sk-secret');
    jevConfig.setSessionKey(null);
    expect(getJevConfig().sessionKey).toBeNull();
    expect(sessionStorage.getItem('cube-atlas.jev.key.v1')).toBeNull();
  });

  it('reports where the key would come from', async () => {
    const { getJevConfig, jevConfig, keySource } = await import('./config');
    expect(keySource(getJevConfig())).toBe('none');
    jevConfig.setServerStatus(true, 'jev-latest');
    expect(keySource(getJevConfig())).toBe('server');
    jevConfig.setSessionKey('sk-own');
    expect(keySource(getJevConfig())).toBe('session');
  });
});

describe('stale-response protection', () => {
  const later = <T>(ms: number, value: T): Promise<T> =>
    new Promise((resolve) => { setTimeout(() => resolve(value), ms); });

  it('discards the result of a superseded run', async () => {
    const runner = new TaskRunner<string>();
    const slow = runner.run(() => later(40, 'first'));
    const fast = runner.run(() => later(5, 'second'));
    // The slow one started first and finishes last; it must not win.
    expect(await fast).toBe('second');
    expect(await slow).toBeNull();
  });

  it('aborts the superseded run rather than leaving it going', async () => {
    const runner = new TaskRunner<string>();
    let sawAbort = false;
    const first = runner.run((signal) => new Promise<string>((resolve) => {
      signal.addEventListener('abort', () => { sawAbort = true; resolve('aborted'); });
    }));
    await runner.run(() => Promise.resolve('second'));
    await first;
    expect(sawAbort).toBe(true);
  });

  it('discards a result after an explicit cancel', async () => {
    const runner = new TaskRunner<string>();
    const pending = runner.run(() => later(20, 'answer'));
    runner.cancel();
    expect(await pending).toBeNull();
  });

  it('keeps the result of the only run in flight', async () => {
    const runner = new TaskRunner<string>();
    expect(await runner.run(() => later(5, 'only'))).toBe('only');
  });

  it('moves its token on every run and every cancel', () => {
    const runner = new TaskRunner<string>();
    const start = runner.token;
    void runner.run(() => Promise.resolve('x'));
    expect(runner.token).toBe(start + 1);
    runner.cancel();
    expect(runner.token).toBe(start + 2);
    expect(runner.isCurrent(start)).toBe(false);
  });

  it('propagates a failure from the current run', async () => {
    const runner = new TaskRunner<string>();
    await expect(runner.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });
});

describe('the transport', () => {
  beforeEach(() => {
    vi.resetModules();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal('sessionStorage', {
      getItem: () => null, setItem: () => undefined, removeItem: () => undefined,
    });
  });

  it('sends nothing at all when the integration is off', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { askJev, JevError } = await import('./client');
    await expect(askJev({
      task: 'command', utterance: 'scramble', language: 'en',
    })).rejects.toBeInstanceOf(JevError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches a learner key as a header, never a body field', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ kind: 'command', action: 'scramble', source: 'jev', needsConfirmation: false }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const { jevConfig } = await import('./config');
    const { askJev } = await import('./client');
    jevConfig.setEnabled(true);
    jevConfig.setSessionKey('sk-learner');
    await askJev({ task: 'command', utterance: 'scramble', language: 'en' });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-jev-key']).toBe('sk-learner');
    expect(String(init.body)).not.toContain('sk-learner');
  });

  it('turns an error body into a typed code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'rate-limit', retryAfter: 30 }), { status: 429 },
    )));
    const { jevConfig } = await import('./config');
    const { askJev, JevError } = await import('./client');
    jevConfig.setEnabled(true);
    jevConfig.setServerStatus(true, 'jev-latest');
    await expect(askJev({ task: 'command', utterance: 'x', language: 'en' }))
      .rejects.toMatchObject({ code: 'rate-limit', retryAfter: 30 });
    await expect(askJev({ task: 'command', utterance: 'x', language: 'en' }))
      .rejects.toBeInstanceOf(JevError);
  });

  it('rejects a response that is not a decision', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"hello":true}', { status: 200 })));
    const { jevConfig } = await import('./config');
    const { askJev } = await import('./client');
    jevConfig.setEnabled(true);
    jevConfig.setServerStatus(true, 'jev-latest');
    await expect(askJev({ task: 'command', utterance: 'x', language: 'en' }))
      .rejects.toMatchObject({ code: 'unexpected-response' });
  });

  it('rejects a body that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 200 })));
    const { jevConfig } = await import('./config');
    const { askJev } = await import('./client');
    jevConfig.setEnabled(true);
    jevConfig.setServerStatus(true, 'jev-latest');
    await expect(askJev({ task: 'command', utterance: 'x', language: 'en' }))
      .rejects.toMatchObject({ code: 'unexpected-response' });
  });

  it('reports an abort as an abort, not a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }));
    const { jevConfig } = await import('./config');
    const { askJev } = await import('./client');
    jevConfig.setEnabled(true);
    jevConfig.setServerStatus(true, 'jev-latest');
    await expect(askJev({ task: 'command', utterance: 'x', language: 'en' }))
      .rejects.toMatchObject({ code: 'aborted' });
  });

  it('passes the caller signal through, so a run can be cancelled', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ kind: 'command', action: 'none', source: 'jev', needsConfirmation: false }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { jevConfig } = await import('./config');
    const { askJev } = await import('./client');
    jevConfig.setEnabled(true);
    jevConfig.setServerStatus(true, 'jev-latest');
    const controller = new AbortController();
    await askJev({ task: 'command', utterance: 'x', language: 'en' }, controller.signal);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

/* ======================================== the plan and the stuck routing === */

describe('the second step of a plan', () => {
  const candidates = ['lesson-graph', 'practice-efficiency', 'explore-map', 'lesson-distance'];

  it('is nothing when there is only one thing to do', () => {
    expect(planSecondStep('lesson-graph', ['lesson-graph'], 0.9, 1)).toBeNull();
  });

  it('follows reading with practice when practice would now pay more', () => {
    expect(planSecondStep('lesson-graph', candidates, 0.8, 0)).toBe('practice-efficiency');
  });

  it('follows reading with more reading when it would not', () => {
    expect(planSecondStep('lesson-graph', candidates, 0.2, 0)).toBe('lesson-distance');
  });

  it('offers a demonstration instead when the support level is high', () => {
    expect(planSecondStep('lesson-graph', candidates, 0.2, 3)).toBe('explore-map');
  });

  it('falls back to course order when no judgment arrived', () => {
    // The two supporting questions are allowed to fail without costing the
    // learner the recommendation they actually asked for.
    expect(planSecondStep('lesson-graph', candidates, null, null)).toBe('lesson-distance');
  });

  it('never repeats the first step', () => {
    for (const ready of [0, 0.5, 1]) {
      for (const support of [0, 1, 2, 3]) {
        expect(planSecondStep('practice-efficiency', candidates, ready, support))
          .not.toBe('practice-efficiency');
      }
    }
  });
});

describe('routing a described difficulty', () => {
  const candidates = ['lesson-notation', 'practice-efficiency', 'compare-solvers'];

  it('routes a specific, on-topic description', () => {
    expect(resolveStuck('lesson-notation', 0.8, 0.95, 1.9, candidates))
      .toEqual({ activity: 'lesson-notation', needsDetail: false, used: true });
  });

  it('refuses to route something that is not about the subject', () => {
    // Off-topic outranks everything, including a confident choice: a sentence
    // about the weather has no right answer among the lessons.
    expect(resolveStuck('lesson-notation', 0.95, 0.05, 2, candidates))
      .toEqual({ activity: null, needsDetail: false, used: true });
  });

  it('asks for more when the description is too vague to act on', () => {
    expect(resolveStuck('lesson-notation', 0.9, 0.9, 0.3, candidates))
      .toEqual({ activity: null, needsDetail: true, used: true });
  });

  it('accepts the model saying nothing fits', () => {
    expect(resolveStuck('none', 0.9, 0.9, 1.9, candidates))
      .toEqual({ activity: null, needsDetail: false, used: true });
  });

  it('never routes to an activity that was not a candidate', () => {
    // The prerequisite filter runs first and is not negotiable; a label
    // outside the list is evidence of nothing.
    expect(resolveStuck('lesson-gods-number', 0.99, 0.99, 2, candidates).activity).toBeNull();
  });

  it('asks for more rather than acting on a low-confidence route', () => {
    const out = resolveStuck('lesson-notation', 0.2, 0.9, 1.9, candidates);
    expect(out).toEqual({ activity: null, needsDetail: true, used: false });
  });
});

/* ==================================== an exercise shaped, then proved ===== */

describe('choosing the difficulty of an exercise', () => {
  const bands = [3, 5, 7, 9, 11];
  const learner = (over: Partial<LearnerSignals> = {}): LearnerSignals => ({
    lessonsDone: 4, lessonsTotal: 12, exercisesDone: 2, attempts: 0,
    optimalSolves: 0, avgWasted: 0, lastWasted: null, hintsLastAttempt: 0,
    strugglingWith: [], ...over,
  });

  it('starts a learner with no record at the easiest band', () => {
    expect(ruleBasedBand(learner(), bands)).toBe(3);
  });

  it('steps up for someone solving cleanly', () => {
    const clean = learner({ attempts: 6, optimalSolves: 4, avgWasted: 0.5 });
    const ordinary = learner({ attempts: 6, optimalSolves: 0, avgWasted: 2 });
    expect(ruleBasedBand(clean, bands)).toBeGreaterThan(ruleBasedBand(ordinary, bands));
  });

  it('steps down for someone leaning on hints', () => {
    const struggling = learner({ attempts: 6, hintsLastAttempt: 3 });
    const ordinary = learner({ attempts: 6 });
    expect(ruleBasedBand(struggling, bands)).toBeLessThan(ruleBasedBand(ordinary, bands));
  });

  it('never returns a distance the application did not offer', () => {
    for (const attempts of [0, 1, 5, 20, 500]) {
      for (const wasted of [0, 1, 5]) {
        expect(bands).toContain(ruleBasedBand(learner({ attempts, avgWasted: wasted }), bands));
      }
    }
  });
});

describe('accepting a difficulty from the model', () => {
  const bands = [3, 5, 7, 9, 11];

  it('takes a confident, in-range answer', () => {
    expect(resolveExercise(2, 0.8, bands, 3)).toEqual({ distance: 7, used: true });
  });

  it('rounds a score that lands between bands', () => {
    expect(resolveExercise(1.6, 0.8, bands, 3)).toEqual({ distance: 7, used: true });
  });

  it('falls back below the confidence floor', () => {
    expect(resolveExercise(4, 0.1, bands, 5)).toEqual({ distance: 5, used: false });
  });

  it('refuses an index outside the offered bands rather than clamping it', () => {
    // Out of range is evidence the answer was about something else, not a
    // near miss to be rounded into range.
    expect(resolveExercise(9, 0.9, bands, 5)).toEqual({ distance: 5, used: false });
    expect(resolveExercise(-1, 0.9, bands, 5)).toEqual({ distance: 5, used: false });
    expect(resolveExercise(Number.NaN, 0.9, bands, 5)).toEqual({ distance: 5, used: false });
  });
});

describe('the focus predicates', () => {
  it('mixed accepts anything, because it promises nothing', () => {
    expect(matchesFocus(SOLVED_FACELETS, 'mixed')).toBe(true);
  });

  it('placement means every piece oriented and something still to move', () => {
    // A solved cube is oriented but has nothing to move, so it is not an
    // exercise about placement - it is not an exercise.
    expect(matchesFocus(SOLVED_FACELETS, 'placement')).toBe(false);
    const cube = new CubieCube();
    for (const m of parseSequence('U R2 U2 R2 U').moves) cube.applyMove(m);
    const facelets = faceletString(toFacelets(cube));
    const r = report(fromFacelets(facelets));
    // The sequence keeps every piece oriented, which is what makes it a
    // placement-only position; the predicate has to agree with the analysis.
    expect(r.orientedEdges === 12 && r.orientedCorners === 8)
      .toBe(matchesFocus(facelets, 'placement'));
  });

  it('orientation means enough pieces are facing the wrong way to notice', () => {
    const cube = new CubieCube();
    for (const m of parseSequence("R U R' U' R U R' U'").moves) cube.applyMove(m);
    const facelets = faceletString(toFacelets(cube));
    const r = report(fromFacelets(facelets));
    expect(matchesFocus(facelets, 'orientation'))
      .toBe(r.orientedEdges <= 10 || r.orientedCorners <= 6);
  });
});
