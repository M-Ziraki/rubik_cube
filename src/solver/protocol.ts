/** Messages exchanged with the solver Web Worker. */

import type { Solution } from './twophase';

export type SolverRequest =
  | { id: number; kind: 'prepare' }
  | { id: number; kind: 'prepare-optimal' }
  | { id: number; kind: 'prepare-pocket' }
  | { id: number; kind: 'solve'; facelets: string; maxLength?: number; timeBudgetMs?: number; goodEnough?: number }
  | { id: number; kind: 'solve-optimal'; facelets: string; maxLength?: number; timeBudgetMs?: number }
  | { id: number; kind: 'scramble'; length?: number; uniform?: boolean }
  | { id: number; kind: 'neighbourhood'; facelets: string; depth: number; maxNodes?: number }
  | { id: number; kind: 'stats' }
  | { id: number; kind: 'pocket-stats' }
  | { id: number; kind: 'pocket-solve'; index: number }
  | { id: number; kind: 'pocket-scramble'; distance: number }
  | { id: number; kind: 'stage'; facelets: string; stage: 'cross' | 'edge-orientation' | 'g1' }
  | { id: number; kind: 'explain'; facelets: string; moves: number[] }
  | { id: number; kind: 'stage-stats' };

export interface TableStats {
  coreBytes: number;
  optimalBytes: number;
  histograms: Record<string, number[]>;
  diameters: Record<string, number>;
}

export interface PocketStats {
  states: number;
  godsNumber: number;
  histogram: number[];
  millis: number;
}

export interface GraphNodePayload {
  id: number;
  facelets: string;
  depth: number;
  parent: number;
  viaMove: number;
}

export interface GraphPayload {
  nodes: GraphNodePayload[];
  edges: { a: number; b: number; move: number }[];
  truncated: boolean;
}

export interface StageStats {
  cross: { size: number; histogram: number[]; diameter: number };
  flip: { size: number; histogram: number[]; diameter: number };
}

export type SolverResponse =
  | { id: number; kind: 'progress'; stage: string; fraction: number }
  | { id: number; kind: 'improved'; solution: Solution }
  | { id: number; kind: 'depth'; provenLowerBound: number; nodes: number }
  | { id: number; kind: 'solution'; solution: Solution }
  | { id: number; kind: 'ready' }
  | { id: number; kind: 'scramble'; moves: number[]; facelets: string }
  | { id: number; kind: 'graph'; graph: GraphPayload }
  | { id: number; kind: 'stats'; stats: TableStats }
  | { id: number; kind: 'pocket-stats'; stats: PocketStats }
  | { id: number; kind: 'pocket-solution'; moves: number[]; distance: number; frames: number[][] }
  | { id: number; kind: 'pocket-scramble'; index: number; distance: number; stickers: number[] }
  | { id: number; kind: 'stage'; moves: number[]; distance: number; optimal: boolean; goal: string }
  | { id: number; kind: 'explain'; narrative: import('../cube/analysis').SolutionNarrative }
  | { id: number; kind: 'stage-stats'; stats: StageStats }
  | { id: number; kind: 'error'; message: string };
