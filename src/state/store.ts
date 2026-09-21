/**
 * Application state.
 *
 * The cube is stored as a starting position plus a list of moves and a cursor.
 * That makes undo, redo, scrubbing through a solution and replaying a lesson
 * all the same operation - move the cursor - and it keeps a complete, honest
 * record of everything the user did, which the training pages grade against.
 */

import { useSyncExternalStore } from 'react';
import { CubieCube } from '../cube/cubie';
import { SOLVED_FACELETS } from '../cube/defs';
import { faceletString, fromFacelets, toFacelets } from '../cube/facelet';

export interface Progress {
  lessonsDone: string[];
  exercisesDone: string[];
  bestByDistance: Record<number, number>;
  challengeRuns: { at: number; distance: number; used: number; optimal: number }[];
}

export interface AppState {
  /** Facelet string of the position the move list starts from. */
  origin: string;
  /** Every move made since the origin, including ones undone. */
  moves: number[];
  /** How many of them are currently applied. */
  cursor: number;
  /** The scramble that produced the origin, when one is known. */
  scrambleMoves: number[];
  tablesReady: boolean;
  tableStage: string;
  tableFraction: number;
  turnSpeed: number;
  theme: 'auto' | 'light' | 'dark';
  progress: Progress;
}

/**
 * Milliseconds per quarter turn. The old default of 240 ms meant a twenty-move
 * solution was over in five seconds, which is no use to anyone trying to follow
 * it. This is the "normal" preset; the Atlas exposes slower ones.
 */
export const DEFAULT_TURN_SPEED = 900;

/** Named speeds, slowest first. Zero means no animation at all. */
export const SPEED_PRESETS = [
  { id: 'very-slow', ms: 2000 },
  { id: 'slow', ms: 1300 },
  { id: 'normal', ms: 900 },
  { id: 'brisk', ms: 450 },
  { id: 'fast', ms: 200 },
  { id: 'instant', ms: 0 },
] as const;

export type SpeedPresetId = (typeof SPEED_PRESETS)[number]['id'];

/** The preset a raw speed corresponds to, for highlighting the control. */
export function presetFor(ms: number): SpeedPresetId {
  let best: SpeedPresetId = 'normal';
  let bd = Infinity;
  for (const p of SPEED_PRESETS) {
    const d = Math.abs(p.ms - ms);
    if (d < bd) { bd = d; best = p.id; }
  }
  return best;
}

const PROGRESS_KEY = 'cube-atlas.progress.v1';
const PREFS_KEY = 'cube-atlas.prefs.v1';

function loadProgress(): Progress {
  const blank: Progress = { lessonsDone: [], exercisesDone: [], bestByDistance: {}, challengeRuns: [] };
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return blank;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      lessonsDone: parsed.lessonsDone ?? [],
      exercisesDone: parsed.exercisesDone ?? [],
      bestByDistance: parsed.bestByDistance ?? {},
      challengeRuns: parsed.challengeRuns ?? [],
    };
  } catch {
    return blank;
  }
}

function loadPrefs(): { turnSpeed: number; theme: AppState['theme'] } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { turnSpeed?: number; theme?: AppState['theme'] };
      return { turnSpeed: p.turnSpeed ?? DEFAULT_TURN_SPEED, theme: p.theme ?? 'auto' };
    }
  } catch { /* ignore a broken or blocked store */ }
  return { turnSpeed: DEFAULT_TURN_SPEED, theme: 'auto' };
}

const prefs = loadPrefs();

let state: AppState = {
  origin: SOLVED_FACELETS,
  moves: [],
  cursor: 0,
  scrambleMoves: [],
  tablesReady: false,
  tableStage: 'waiting',
  tableFraction: 0,
  turnSpeed: prefs.turnSpeed,
  theme: prefs.theme,
  progress: loadProgress(),
};

const listeners = new Set<() => void>();

function emit(): void { listeners.forEach((l) => l()); }

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  emit();
}

export function getState(): AppState { return state; }

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

/* ------------------------------------------------------------- derived --- */

const cubeCache = new Map<string, CubieCube>();

/** The cube as it stands right now. */
export function currentCube(s: AppState = state): CubieCube {
  const key = `${s.origin}|${s.moves.slice(0, s.cursor).join(',')}`;
  const hit = cubeCache.get(key);
  if (hit) return hit.clone();
  const cube = fromFacelets(s.origin);
  for (let i = 0; i < s.cursor; i++) cube.applyMove(s.moves[i]);
  if (cubeCache.size > 400) cubeCache.clear();
  cubeCache.set(key, cube.clone());
  return cube;
}

export function currentFacelets(s: AppState = state): string {
  return faceletString(toFacelets(currentCube(s)));
}

export function isSolved(s: AppState = state): boolean {
  return currentCube(s).isSolved();
}

/* ------------------------------------------------------------- actions --- */

export const actions = {
  applyMove(move: number): void {
    const moves = state.moves.slice(0, state.cursor);
    moves.push(move);
    set({ moves, cursor: moves.length });
  },

  applyMoves(list: number[]): void {
    const moves = state.moves.slice(0, state.cursor).concat(list);
    set({ moves, cursor: moves.length });
  },

  /** Append moves without advancing, so the player can step through them. */
  queueMoves(list: number[]): void {
    const moves = state.moves.slice(0, state.cursor).concat(list);
    set({ moves });
  },

  undo(): void { if (state.cursor > 0) set({ cursor: state.cursor - 1 }); },
  redo(): void { if (state.cursor < state.moves.length) set({ cursor: state.cursor + 1 }); },
  seek(cursor: number): void { set({ cursor: Math.max(0, Math.min(state.moves.length, cursor)) }); },

  clearMoves(): void { set({ moves: [], cursor: 0 }); },

  setPosition(facelets: string, scrambleMoves: number[] = []): void {
    set({ origin: facelets, moves: [], cursor: 0, scrambleMoves });
  },

  resetToSolved(): void {
    set({ origin: SOLVED_FACELETS, moves: [], cursor: 0, scrambleMoves: [] });
  },

  /** Put the cube back to the scrambled start without losing the move list. */
  rewind(): void { set({ cursor: 0 }); },

  setTables(ready: boolean, stage = state.tableStage, fraction = state.tableFraction): void {
    set({ tablesReady: ready, tableStage: stage, tableFraction: fraction });
  },

  setTurnSpeed(ms: number): void {
    set({ turnSpeed: Math.max(0, ms) });
    savePrefs();
  },

  setTheme(theme: AppState['theme']): void {
    set({ theme });
    applyTheme(theme);
    savePrefs();
  },

  markLesson(id: string): void {
    if (state.progress.lessonsDone.includes(id)) return;
    const progress = { ...state.progress, lessonsDone: [...state.progress.lessonsDone, id] };
    set({ progress });
    saveProgress();
  },

  markExercise(id: string): void {
    if (state.progress.exercisesDone.includes(id)) return;
    const progress = { ...state.progress, exercisesDone: [...state.progress.exercisesDone, id] };
    set({ progress });
    saveProgress();
  },

  recordRun(distance: number, used: number, optimal: number): void {
    const best = { ...state.progress.bestByDistance };
    if (best[distance] === undefined || used < best[distance]) best[distance] = used;
    const runs = [...state.progress.challengeRuns, { at: Date.now(), distance, used, optimal }].slice(-200);
    set({ progress: { ...state.progress, bestByDistance: best, challengeRuns: runs } });
    saveProgress();
  },

  resetProgress(): void {
    set({ progress: { lessonsDone: [], exercisesDone: [], bestByDistance: {}, challengeRuns: [] } });
    saveProgress();
  },
};

function saveProgress(): void {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress)); } catch { /* storage may be unavailable */ }
}

function savePrefs(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ turnSpeed: state.turnSpeed, theme: state.theme }));
  } catch { /* storage may be unavailable */ }
}

export function applyTheme(theme: AppState['theme']): void {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
