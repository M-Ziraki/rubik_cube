/**
 * The animation pipeline, tested where the bugs actually were.
 *
 * Three things used to go wrong and each has a test here: a turn could be
 * drawn from the wrong starting position, the next move could begin before the
 * previous one had been committed, and pausing or stepping could leave the
 * renderers showing a position the store did not agree with.
 *
 * The clock needs `window`, `performance` and `requestAnimationFrame`, so this
 * file installs controllable versions before importing anything that touches
 * them. Driving time by hand also means the tests are exact rather than flaky.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/* ------------------------------------------------- a clock we can drive --- */

let now = 0;
let frames: ((t: number) => void)[] = [];
const timeouts: { at: number; fn: () => void }[] = [];

function advance(ms: number): void {
  const target = now + ms;
  // Step in animation-frame sized chunks so easing is sampled the way a real
  // browser would sample it.
  while (now < target) {
    now = Math.min(target, now + 16);
    const due = frames;
    frames = [];
    for (const f of due) f(now);
    for (let i = timeouts.length - 1; i >= 0; i--) {
      if (timeouts[i].at <= now) { const [t] = timeouts.splice(i, 1); t.fn(); }
    }
  }
}

/**
 * Run frames, timers and microtasks until nothing is left to do.
 *
 * The player advances on awaited promises as well as on animation frames, so
 * draining one without the other stops the loop early and makes a passing test
 * out of a stalled player. This drains both and only gives up once several
 * rounds in a row have produced no pending work.
 */
async function settle(maxMs = 60000): Promise<void> {
  const until = now + maxMs;
  let quiet = 0;
  while (now < until && quiet < 4) {
    const busy = frames.length > 0 || timeouts.length > 0;
    if (busy) { advance(16); quiet = 0; } else { quiet++; }
    // Several turns of the microtask queue: the player awaits more than once
    // between moves.
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }
}

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.requestAnimationFrame = (fn: (t: number) => void): number => {
    frames.push(fn);
    return frames.length;
  };
  g.cancelAnimationFrame = (): void => { /* frames are drained each step */ };
  g.performance = { now: () => now } as Performance;
  g.setTimeout = ((fn: () => void, ms = 0) => {
    timeouts.push({ at: now + ms, fn });
    return timeouts.length;
  }) as unknown as typeof setTimeout;
  g.clearTimeout = (() => undefined) as unknown as typeof clearTimeout;
  g.localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  } as unknown as Storage;
  g.window = g as unknown as Window & typeof globalThis;
  g.document = { documentElement: { style: {}, dataset: {} } } as unknown as Document;
});

type StoreModule = typeof import('./store');
type ClockModule = typeof import('./turnClock');
type PlayerModule = typeof import('./player');

let store: StoreModule;
let clock: ClockModule;
let player: PlayerModule;

beforeAll(async () => {
  store = await import('./store');
  clock = await import('./turnClock');
  player = await import('./player');
});

beforeEach(async () => {
  player.player.stop();
  store.actions.resetToSolved();
  store.actions.setTurnSpeed(store.DEFAULT_TURN_SPEED);
  clock.finishTurn();
  clock.resyncClock();
  frames = [];
  timeouts.length = 0;
  await Promise.resolve();
});

/* -------------------------------------------------------------- timing --- */

describe('turn duration', () => {
  it('gives half turns longer than quarter turns', () => {
    const quarter = clock.durationFor(0, 900);   // U
    const half = clock.durationFor(1, 900);      // U2
    expect(half).toBeGreaterThan(quarter);
    expect(half / quarter).toBeCloseTo(1.35, 2);
  });

  it('is zero at the instant preset, for every move', () => {
    for (let m = 0; m < 18; m++) expect(clock.durationFor(m, 0)).toBe(0);
  });

  it('scales with the chosen speed', () => {
    expect(clock.durationFor(0, 2000)).toBe(2000);
    expect(clock.durationFor(0, 200)).toBe(200);
  });
});

/* --------------------------------------------------------------- clock --- */

describe('the turn clock', () => {
  it('animates a single move from the position before it', () => {
    const before = store.currentFacelets();
    store.actions.applyMove(3); // R
    const turn = clock.currentTurn();
    expect(turn).not.toBeNull();
    expect(turn!.move).toBe(3);
    expect(turn!.from).toBe(before);
    expect(turn!.to).toBe(store.currentFacelets());
    expect(turn!.progress).toBe(0);
  });

  it('runs progress from 0 to 1 and then commits', () => {
    store.actions.applyMove(3);
    const seen: number[] = [];
    const un = clock.subscribeTurn((t) => seen.push(t ? t.raw : 1));
    advance(clock.durationFor(3) / 2);
    expect(clock.isTurning()).toBe(true);
    expect(clock.currentTurn()!.raw).toBeGreaterThan(0.3);
    expect(clock.currentTurn()!.raw).toBeLessThan(0.7);
    advance(clock.durationFor(3));
    expect(clock.isTurning()).toBe(false);
    expect(seen[seen.length - 1]).toBe(1);
    un();
  });

  it('animates the inverse move when stepping backwards', () => {
    store.actions.applyMove(3); // R
    clock.finishTurn();
    store.actions.undo();
    expect(clock.currentTurn()!.move).toBe(5); // R'
  });

  it('snaps rather than animating when the cursor jumps', () => {
    store.actions.applyMoves([3, 0, 1, 2]);
    clock.finishTurn();
    store.actions.seek(0);
    expect(clock.currentTurn()).toBeNull();
  });

  it('snaps when the position is replaced entirely', () => {
    store.actions.applyMove(3);
    store.actions.setPosition(store.currentFacelets(), []);
    expect(clock.currentTurn()).toBeNull();
  });

  it('never leaves a turn half applied when cut short', () => {
    store.actions.applyMove(3);
    advance(50);
    clock.finishTurn();
    expect(clock.isTurning()).toBe(false);
    // The store is authoritative and was updated before the animation began.
    expect(store.currentFacelets()).not.toBe(store.getState().origin);
  });
});

/* ------------------------------------------------------------- player --- */

describe('the player', () => {
  it('plays every queued move exactly once, in order', async () => {
    const moves = [3, 0, 1, 5, 9];
    store.actions.queueMoves(moves);
    store.actions.setTurnSpeed(0);
    player.player.play();
    await settle();
    expect(store.getState().cursor).toBe(moves.length);
    expect(store.getState().moves).toEqual(moves);
    expect(player.getPlayerState().status).toBe('idle');
  });

  it('does not start a move before the previous turn has been committed', async () => {
    store.actions.queueMoves([3, 0, 1]);
    store.actions.setTurnSpeed(900);
    player.player.play();
    await Promise.resolve();
    // One turn in flight; the cursor must not run ahead of it.
    expect(store.getState().cursor).toBe(1);
    advance(100);
    await Promise.resolve();
    expect(store.getState().cursor).toBe(1);
    await settle();
    expect(store.getState().cursor).toBe(3);
  });

  it('pauses without losing or corrupting the position', async () => {
    store.actions.queueMoves([3, 0, 1, 5]);
    store.actions.setTurnSpeed(0);
    player.player.play();
    await Promise.resolve();
    player.player.pause();
    const cursor = store.getState().cursor;
    const facelets = store.currentFacelets();
    await settle(2000);
    expect(store.getState().cursor).toBe(cursor);
    expect(store.currentFacelets()).toBe(facelets);
    expect(player.getPlayerState().status).toBe('paused');
  });

  it('resumes from where it paused', async () => {
    store.actions.queueMoves([3, 0, 1, 5]);
    store.actions.setTurnSpeed(0);
    player.player.play();
    await Promise.resolve();
    player.player.pause();
    const at = store.getState().cursor;
    player.player.play();
    await settle();
    expect(at).toBeLessThan(4);
    expect(store.getState().cursor).toBe(4);
  });

  it('steps back to exactly the preceding configuration', () => {
    const positions: string[] = [store.currentFacelets()];
    for (const m of [3, 0, 1, 5]) {
      store.actions.applyMove(m);
      clock.finishTurn();
      positions.push(store.currentFacelets());
    }
    for (let i = positions.length - 1; i > 0; i--) {
      expect(store.currentFacelets()).toBe(positions[i]);
      player.player.stepBack();
    }
    expect(store.currentFacelets()).toBe(positions[0]);
  });

  it('stop does not rewind the cube', async () => {
    store.actions.queueMoves([3, 0, 1, 5]);
    store.actions.setTurnSpeed(0);
    player.player.play();
    await Promise.resolve();
    const cursor = store.getState().cursor;
    const facelets = store.currentFacelets();
    player.player.stop();
    expect(store.getState().cursor).toBe(cursor);
    expect(store.currentFacelets()).toBe(facelets);
  });

  it('restart returns to the start of the sequence, keeping the moves', () => {
    store.actions.queueMoves([3, 0, 1, 5]);
    store.actions.seek(3);
    player.player.restart();
    expect(store.getState().cursor).toBe(0);
    expect(store.getState().moves).toHaveLength(4);
  });

  it('accepts a speed change mid-playback without restarting', async () => {
    store.actions.queueMoves([3, 0, 1, 5, 9, 12]);
    store.actions.setTurnSpeed(900);
    player.player.play();
    await Promise.resolve();
    const cursor = store.getState().cursor;
    store.actions.setTurnSpeed(0);
    expect(store.getState().cursor).toBe(cursor);
    expect(player.getPlayerState().status).toBe('playing');
    await settle();
    expect(store.getState().cursor).toBe(6);
  });

  it('yields to a manual move without corrupting the sequence', async () => {
    store.actions.queueMoves([3, 0, 1, 5]);
    store.actions.setTurnSpeed(900);
    player.player.play();
    await Promise.resolve();
    player.player.yieldToUser();
    store.actions.applyMove(12); // L, by hand
    await settle(3000);
    expect(player.getPlayerState().status).toBe('idle');
    // The move list is truncated at the cursor and the hand turn appended, so
    // no queued move can be applied out of order afterwards.
    const s = store.getState();
    expect(s.moves[s.cursor - 1]).toBe(12);
    expect(s.cursor).toBe(s.moves.length);
  });

  it('survives rapid interaction without dropping or duplicating a move', async () => {
    store.actions.setTurnSpeed(0);
    const applied: number[] = [];
    for (let i = 0; i < 40; i++) {
      const m = (i * 7) % 18;
      applied.push(m);
      store.actions.applyMove(m);
      if (i % 5 === 0) player.player.stepBack();
      if (i % 5 === 0) player.player.stepForward();
    }
    await settle(5000);
    expect(store.getState().moves).toEqual(applied);
    expect(store.getState().cursor).toBe(applied.length);
  });

  it('is a no-op when there is nothing queued', () => {
    player.player.play();
    expect(player.getPlayerState().status).toBe('idle');
  });
});

/* ------------------------------------------------------ speed presets --- */

describe('speed presets', () => {
  it('round-trip through presetFor', () => {
    for (const p of store.SPEED_PRESETS) expect(store.presetFor(p.ms)).toBe(p.id);
  });

  it('never stores a negative speed', () => {
    store.actions.setTurnSpeed(-500);
    expect(store.getState().turnSpeed).toBe(0);
  });
});
