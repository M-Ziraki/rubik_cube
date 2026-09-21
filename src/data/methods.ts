/**
 * How people actually solve cubes, and how that compares to what a computer
 * does. Move counts are typical figures in the face-turn metric for an
 * average random scramble; individual solves vary.
 *
 * Only the numbers and the classification live here. Every piece of prose -
 * names, descriptions, the honest note about why each method is not optimal -
 * lives in the dictionaries, under `method.<id>.*` and `path.<id>.*`, so the
 * whole comparison translates with the rest of the application.
 */

export interface SolvingMethod {
  id: string;
  kind: 'human' | 'hybrid' | 'machine';
  typicalMoves: number;
}

export const METHODS: SolvingMethod[] = [
  { id: 'beginner', kind: 'human', typicalMoves: 110 },
  { id: 'cfop', kind: 'human', typicalMoves: 55 },
  { id: 'roux', kind: 'human', typicalMoves: 48 },
  { id: 'thistlethwaite', kind: 'hybrid', typicalMoves: 45 },
  { id: 'two-phase', kind: 'machine', typicalMoves: 19 },
  { id: 'optimal', kind: 'machine', typicalMoves: 18 },
];

export interface PathStage {
  id: string;
}

export const LEARNING_PATH: PathStage[] = [
  { id: 'read' },
  { id: 'solve' },
  { id: 'invariants' },
  { id: 'blocks' },
  { id: 'ladder' },
  { id: 'execute' },
];
