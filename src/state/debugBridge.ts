/**
 * A read-only window onto the app's state, for the browser verification script.
 *
 * Everything here is a snapshot: nothing can be set through this bridge, so it
 * cannot become a second way of changing the cube. It exists because asserting
 * on rendered text is a poor way to check that a pause left the cursor where it
 * should be - the numbers themselves are what matter.
 */

import { currentFacelets, getState, isSolved } from './store';
import { getPlayerState } from './player';
import { currentTurn } from './turnClock';

export interface AppSnapshot {
  origin: string;
  facelets: string;
  moves: number[];
  cursor: number;
  solved: boolean;
  turnSpeed: number;
  status: string;
  turning: boolean;
  turnProgress: number;
}

export function snapshot(): AppSnapshot {
  const s = getState();
  const turn = currentTurn();
  return {
    origin: s.origin,
    facelets: currentFacelets(s),
    moves: [...s.moves],
    cursor: s.cursor,
    solved: isSolved(s),
    turnSpeed: s.turnSpeed,
    status: getPlayerState().status,
    turning: turn !== null,
    turnProgress: turn?.progress ?? 1,
  };
}

declare global {
  interface Window { __cubeAtlasState?: () => AppSnapshot }
}

if (typeof window !== 'undefined') window.__cubeAtlasState = snapshot;
