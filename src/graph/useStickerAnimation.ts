/**
 * The sticker map's view of the shared turn clock.
 *
 * This used to run its own requestAnimationFrame loop alongside the 3D scene's
 * separate one, which is how the two managed to disagree about how long a half
 * turn lasts. Now both read the same clock, so they start and finish together
 * by construction rather than by coincidence.
 */

import { useSyncExternalStore } from 'react';
import { currentFacelets, getState, subscribe } from '../state/store';
import { currentTurn, subscribeTurn } from '../state/turnClock';

export interface StickerAnimation {
  facelets: string;
  previousFacelets: string;
  move: number | null;
  progress: number;
}

let cached: StickerAnimation = {
  facelets: '', previousFacelets: '', move: null, progress: 1,
};

function read(): StickerAnimation {
  const turn = currentTurn();
  const next: StickerAnimation = turn
    ? { facelets: turn.to, previousFacelets: turn.from, move: turn.move, progress: turn.progress }
    : (() => {
      const f = currentFacelets(getState());
      return { facelets: f, previousFacelets: f, move: null, progress: 1 };
    })();
  // useSyncExternalStore compares by identity, so only allocate on a real change.
  if (
    next.facelets !== cached.facelets
    || next.previousFacelets !== cached.previousFacelets
    || next.move !== cached.move
    || next.progress !== cached.progress
  ) cached = next;
  return cached;
}

function subscribeBoth(onChange: () => void): () => void {
  const a = subscribeTurn(onChange);
  const b = subscribe(onChange);
  return () => { a(); b(); };
}

export function useStickerAnimation(): StickerAnimation {
  return useSyncExternalStore(subscribeBoth, read, read);
}
