/**
 * Promise-friendly wrapper around the solver worker.
 *
 * One worker is shared by the whole app. Requests are tagged with an id so
 * several can be in flight, and streaming messages (table-building progress,
 * a better solution than the last one) are delivered to per-request callbacks.
 */

import type { SolutionNarrative } from '../cube/analysis';
import type {
  GraphPayload, PocketStats, SolverRequest, SolverResponse, StageStats, TableStats,
} from './protocol';
import type { Solution } from './twophase';

/** Omit that distributes over a union, so each request variant keeps its shape. */
type RequestBody = SolverRequest extends infer T ? (T extends { id: number } ? Omit<T, 'id'> : never) : never;

type Handlers = {
  resolve: (value: never) => void;
  reject: (err: Error) => void;
  onProgress?: (stage: string, fraction: number) => void;
  onImprove?: (s: Solution) => void;
  onDepth?: (provenLowerBound: number, nodes: number) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Handlers>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<SolverResponse>) => {
    const msg = ev.data;
    const h = pending.get(msg.id);
    if (!h) return;
    switch (msg.kind) {
      case 'progress': h.onProgress?.(msg.stage, msg.fraction); return;
      case 'improved': h.onImprove?.(msg.solution); return;
      case 'depth': h.onDepth?.(msg.provenLowerBound, msg.nodes); return;
      case 'error':
        pending.delete(msg.id);
        h.reject(new Error(msg.message));
        return;
      default:
        pending.delete(msg.id);
        h.resolve(msg as never);
    }
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'The solver worker crashed.');
    pending.forEach((h) => h.reject(err));
    pending.clear();
  };
  return worker;
}

function send<R extends SolverResponse>(
  req: RequestBody,
  extra: Omit<Handlers, 'resolve' | 'reject'> = {},
): Promise<R> {
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<R>((resolve, reject) => {
    pending.set(id, { resolve: resolve as never, reject, ...extra });
    w.postMessage({ ...req, id } as SolverRequest);
  });
}

export function prepareTables(onProgress?: (stage: string, fraction: number) => void): Promise<void> {
  return send({ kind: 'prepare' }, { onProgress }).then(() => undefined);
}

export function prepareOptimalTables(onProgress?: (stage: string, fraction: number) => void): Promise<void> {
  return send({ kind: 'prepare-optimal' }, { onProgress }).then(() => undefined);
}

export function preparePocket(): Promise<void> {
  return send({ kind: 'prepare-pocket' }).then(() => undefined);
}

export function solve(
  facelets: string,
  opts: { maxLength?: number; timeBudgetMs?: number; goodEnough?: number; onImprove?: (s: Solution) => void } = {},
): Promise<Solution> {
  return send<Extract<SolverResponse, { kind: 'solution' }>>(
    { kind: 'solve', facelets, maxLength: opts.maxLength, timeBudgetMs: opts.timeBudgetMs, goodEnough: opts.goodEnough },
    { onImprove: opts.onImprove },
  ).then((r) => r.solution);
}

export function solveOptimally(
  facelets: string,
  opts: {
    maxLength?: number; timeBudgetMs?: number;
    onProgress?: (stage: string, fraction: number) => void;
    onDepth?: (provenLowerBound: number, nodes: number) => void;
  } = {},
): Promise<Solution> {
  return send<Extract<SolverResponse, { kind: 'solution' }>>(
    { kind: 'solve-optimal', facelets, maxLength: opts.maxLength, timeBudgetMs: opts.timeBudgetMs },
    { onProgress: opts.onProgress, onDepth: opts.onDepth },
  ).then((r) => r.solution);
}

export function requestScramble(length = 25, uniform = false): Promise<{ moves: number[]; facelets: string }> {
  return send<Extract<SolverResponse, { kind: 'scramble' }>>({ kind: 'scramble', length, uniform })
    .then((r) => ({ moves: r.moves, facelets: r.facelets }));
}

export function requestNeighbourhood(facelets: string, depth: number, maxNodes = 4000): Promise<GraphPayload> {
  return send<Extract<SolverResponse, { kind: 'graph' }>>({ kind: 'neighbourhood', facelets, depth, maxNodes })
    .then((r) => r.graph);
}

export function requestStats(): Promise<TableStats> {
  return send<Extract<SolverResponse, { kind: 'stats' }>>({ kind: 'stats' }).then((r) => r.stats);
}

export function requestPocketStats(): Promise<PocketStats> {
  return send<Extract<SolverResponse, { kind: 'pocket-stats' }>>({ kind: 'pocket-stats' }).then((r) => r.stats);
}

export function solvePocketState(index: number): Promise<{ moves: number[]; distance: number; frames: number[][] }> {
  return send<Extract<SolverResponse, { kind: 'pocket-solution' }>>({ kind: 'pocket-solve', index })
    .then((r) => ({ moves: r.moves, distance: r.distance, frames: r.frames }));
}

export function scramblePocket(distance: number): Promise<{ index: number; distance: number; stickers: number[] }> {
  return send<Extract<SolverResponse, { kind: 'pocket-scramble' }>>({ kind: 'pocket-scramble', distance })
    .then((r) => ({ index: r.index, distance: r.distance, stickers: r.stickers }));
}

export function solveStage(
  facelets: string, stage: 'cross' | 'edge-orientation' | 'g1',
): Promise<{ moves: number[]; distance: number; optimal: boolean; goal: string }> {
  return send<Extract<SolverResponse, { kind: 'stage' }>>({ kind: 'stage', facelets, stage })
    .then((r) => ({ moves: r.moves, distance: r.distance, optimal: r.optimal, goal: r.goal }));
}

export function explainMoves(facelets: string, moves: number[]): Promise<SolutionNarrative> {
  return send<Extract<SolverResponse, { kind: 'explain' }>>({ kind: 'explain', facelets, moves })
    .then((r) => r.narrative);
}

export function requestStageStats(): Promise<StageStats> {
  return send<Extract<SolverResponse, { kind: 'stage-stats' }>>({ kind: 'stage-stats' }).then((r) => r.stats);
}
