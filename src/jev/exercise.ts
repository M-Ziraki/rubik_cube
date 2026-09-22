/**
 * Building the position a shape describes, and proving it.
 *
 * This is the half of the feature the model has nothing to do with. Jev says
 * "nine moves, and make it about orientation"; this generates candidates,
 * verifies the distance with the optimal solver, and checks the focus against
 * the position's own analysis. A model never asserts how far a position is
 * from solved - that is a fact the search knows exactly, and a probability
 * would be a worse answer than a proof.
 *
 * When no candidate matches the focus inside the budget, it returns the
 * verified position it did find and says the focus was not met. Silently
 * handing over a position that does not have the property it was asked for
 * would make the feature a decoration.
 */

import { requestScramble, solveOptimally } from '../solver/client';
import { fromFacelets } from '../cube/facelet';
import { report } from '../cube/analysis';
import type { ExerciseFocus } from './protocol';

export interface GeneratedExercise {
  facelets: string;
  /** Proven by the optimal solver, not assumed from the scramble length. */
  distance: number;
  /** The optimal solution found while proving it. */
  solution: number[];
  focus: ExerciseFocus;
  /** False when the budget ran out before a position with the focus appeared. */
  focusMet: boolean;
  /** How many candidates were verified on the way. */
  tried: number;
}

/**
 * Whether a position has the property the focus names.
 *
 * Both predicates are statements about the cube group that the analysis
 * already computes, not heuristics: `placement` is membership of the subgroup
 * where every piece is oriented, which is the thing the lessons call G1.
 */
export function matchesFocus(facelets: string, focus: ExerciseFocus): boolean {
  if (focus === 'mixed') return true;
  const r = report(fromFacelets(facelets));
  if (focus === 'placement') {
    // Everything oriented, and something still to move.
    return r.orientedEdges === 12 && r.orientedCorners === 8 && r.solvedPieces < 20;
  }
  // Enough pieces facing the wrong way that orientation is the visible work.
  return r.orientedEdges <= 10 || r.orientedCorners <= 6;
}

export interface GenerateOptions {
  /** Candidates to verify before giving up on the focus. */
  attempts?: number;
  /** Per-search budget. The distances here are small; this is a safety net. */
  timeBudgetMs?: number;
  signal?: AbortSignal;
}

export async function generateExercise(
  distance: number,
  focus: ExerciseFocus,
  { attempts = 10, timeBudgetMs = 12_000, signal }: GenerateOptions = {},
): Promise<GeneratedExercise | null> {
  let fallback: GeneratedExercise | null = null;

  for (let tried = 1; tried <= attempts; tried += 1) {
    if (signal?.aborted) return fallback;
    const candidate = await requestScramble(distance, false);
    const proof = await solveOptimally(candidate.facelets, { timeBudgetMs, maxLength: distance });
    // The scramble length is not the distance: a walk of nine turns can land
    // seven moves from home. Only a proof counts.
    if (proof.length !== distance) continue;

    const found: GeneratedExercise = {
      facelets: candidate.facelets,
      distance: proof.length,
      solution: proof.moves,
      focus,
      focusMet: matchesFocus(candidate.facelets, focus),
      tried,
    };
    if (found.focusMet) return found;
    fallback ??= found;
  }
  return fallback;
}
