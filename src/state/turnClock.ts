/**
 * One clock for every animated turn.
 *
 * Before this existed, the 3D scene owned its own timer and queue while the
 * sticker map ran a second, independent one. The two drifted - a half turn took
 * 1.45x longer in the scene than on the map - and playback advanced on a
 * `setInterval` that had no idea whether either had finished, so moves piled up
 * and the cube raced ahead of the picture.
 *
 * Now the store is the single source of truth for *what* the cube is, and this
 * module is the single source of truth for *where in a turn* we are. It watches
 * the cursor, plays exactly one turn at a time, and tells everybody the same
 * progress value. A turn is a transaction: it either has not started, is
 * running at a known progress, or has finished and been committed. There is no
 * state in between for a renderer to get wrong.
 */

import { MOVE_INVERSE, MOVE_POWER } from '../cube/defs';
import { currentFacelets, getState, subscribe } from './store';

export interface Turn {
  /** The move being animated, as an index into MOVE_NAMES. */
  move: number;
  /** Facelets before the turn. */
  from: string;
  /** Facelets after it. */
  to: string;
  /** Eased 0..1, what renderers should draw. */
  progress: number;
  /** Linear 0..1, for anything that needs real time. */
  raw: number;
}

type Listener = (turn: Turn | null) => void;

const listeners = new Set<Listener>();
let current: Turn | null = null;
let rafId: number | null = null;
let startedAt = 0;
let durationMs = 0;
let waiters: (() => void)[] = [];

/** Matches the easing the 3D pivot used, so nothing changes visually. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function notify(): void {
  for (const l of [...listeners]) l(current);
}

function settle(): void {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  current = null;
  notify();
  const pending = waiters;
  waiters = [];
  for (const w of pending) w();
}

function frame(now: number): void {
  if (!current) return;
  const raw = durationMs <= 0 ? 1 : Math.min(1, (now - startedAt) / durationMs);
  if (raw >= 1) { settle(); return; }
  current = { ...current, raw, progress: ease(raw) };
  notify();
  rafId = requestAnimationFrame(frame);
}

/**
 * How long a turn should take. Half turns are given a little longer because
 * they sweep twice as far, but the same figure is used by every renderer.
 */
export function durationFor(move: number, speedMs = getState().turnSpeed): number {
  if (speedMs <= 0) return 0;
  return Math.round(speedMs * (MOVE_POWER[move] === 2 ? 1.35 : 1));
}

export function currentTurn(): Turn | null {
  return current;
}

export function isTurning(): boolean {
  return current !== null;
}

/** Resolves once no turn is in flight. */
export function whenSettled(): Promise<void> {
  if (!current) return Promise.resolve();
  return new Promise<void>((resolve) => { waiters.push(resolve); });
}

/**
 * Cut any running turn short and commit it. The store has already been updated,
 * so committing simply means telling renderers to show the finished state.
 */
export function finishTurn(): void {
  if (current) settle();
}

export function subscribeTurn(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function begin(move: number, from: string, to: string, ms: number): void {
  if (current) settle();
  if (ms <= 0) { notify(); return; }
  current = { move, from, to, progress: 0, raw: 0 };
  startedAt = performance.now();
  durationMs = ms;
  notify();
  rafId = requestAnimationFrame(frame);
}

/* --------------------------------------------------- watching the store --- */

let last = { origin: getState().origin, cursor: getState().cursor };

function onStoreChange(): void {
  const s = getState();
  const prev = last;
  last = { origin: s.origin, cursor: s.cursor };

  // Anything other than a single step is a jump: snap, do not animate.
  if (s.origin !== prev.origin || Math.abs(s.cursor - prev.cursor) !== 1) {
    finishTurn();
    return;
  }
  const forward = s.cursor === prev.cursor + 1;
  const move = forward ? s.moves[s.cursor - 1] : MOVE_INVERSE[s.moves[s.cursor]];
  if (move === undefined) { finishTurn(); return; }
  const from = currentFacelets({ ...s, cursor: prev.cursor });
  const to = currentFacelets(s);
  begin(move, from, to, durationFor(move, s.turnSpeed));
}

if (typeof window !== 'undefined') subscribe(onStoreChange);

/** Test hook: re-reads the store without animating, after a direct mutation. */
export function resyncClock(): void {
  last = { origin: getState().origin, cursor: getState().cursor };
  finishTurn();
}
