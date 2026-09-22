/**
 * Playback: walking a move list at a speed you can actually follow.
 *
 * The old implementation used `setInterval(turnSpeed + 90)`, which is a guess,
 * not a guarantee. If a turn took longer than the guess - and half turns always
 * did - the next move started before the last had finished, the renderers fell
 * behind, and a twenty-move solution went past in a blur.
 *
 * This advances one move, waits for the turn clock to report that the turn has
 * actually been committed, pauses for a readable beat, and only then advances
 * again. Pause stops scheduling; it never leaves a turn half-applied, because
 * the store is updated before the animation starts and the animation is only a
 * picture of a change that has already happened.
 */

import { useSyncExternalStore } from 'react';
import { actions, getState } from './store';
import { finishTurn, whenSettled } from './turnClock';

export type PlayerStatus = 'idle' | 'playing' | 'paused';

export interface PlayerState {
  status: PlayerStatus;
  /** Gap between turns, on top of the turn itself. */
  gapMs: number;
}

let state: PlayerState = { status: 'idle', gapMs: 140 };
let runToken = 0;
const listeners = new Set<() => void>();

function set(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribePlayer(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getPlayerState(): PlayerState {
  return state;
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribePlayer, getPlayerState, getPlayerState);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => { window.setTimeout(r, ms); });

async function loop(token: number): Promise<void> {
  while (token === runToken && state.status === 'playing') {
    const s = getState();
    if (s.cursor >= s.moves.length) { set({ status: 'idle' }); return; }
    actions.redo();
    await whenSettled();
    if (token !== runToken || state.status !== 'playing') return;
    // A readable beat between turns; skipped entirely at instant speed.
    if (getState().turnSpeed > 0) await sleep(state.gapMs);
  }
}

export const player = {
  /** Start or resume walking forwards through the queued moves. */
  play(): void {
    const s = getState();
    if (s.cursor >= s.moves.length) return;
    if (state.status === 'playing') return;
    set({ status: 'playing' });
    void loop(++runToken);
  },

  pause(): void {
    if (state.status !== 'playing') return;
    runToken++;
    set({ status: 'paused' });
  },

  toggle(): void {
    if (state.status === 'playing') this.pause();
    else this.play();
  },

  /**
   * Stop playing and stay exactly where we are. Deliberately does not rewind:
   * losing your place because you pressed stop is its own kind of bug.
   */
  stop(): void {
    runToken++;
    set({ status: 'idle' });
  },

  /** One move forward, finishing any turn in flight first. */
  stepForward(): void {
    this.pause();
    finishTurn();
    actions.redo();
  },

  stepBack(): void {
    this.pause();
    finishTurn();
    actions.undo();
  },

  /** Back to the start of the queued sequence, without playing. */
  restart(): void {
    runToken++;
    set({ status: 'idle' });
    finishTurn();
    actions.rewind();
  },

  /** Rewind and immediately play from the top. */
  replay(): void {
    this.restart();
    window.setTimeout(() => this.play(), 30);
  },

  /**
   * Called before any manual interaction that would change the move list.
   * Playback stops rather than fighting the user for the cursor.
   */
  yieldToUser(): void {
    if (state.status !== 'idle') this.stop();
    finishTurn();
  },

  /** Jump to a point in the move list, stopping playback first. */
  /**
   * Queue a sequence and watch it happen.
   *
   * The reason this exists: `actions.applyMoves(list)` jumps the cursor by
   * several at once, and the turn clock deliberately snaps rather than
   * animates anything that is not a single step - a jump is not a turn. So
   * every "apply this algorithm" button in the application applied its
   * algorithm instantly, which is exactly the wrong behaviour for a
   * demonstration and was read as "some pages animate and some do not".
   *
   * This routes them through the path that already works instead of adding a
   * second animation path beside it: append, then walk. One clock, one queue,
   * one set of guarantees about a turn being committed before the next begins.
   */
  playSequence(moves: readonly number[]): void {
    if (moves.length === 0) return;
    player.stop();
    actions.queueMoves([...moves]);
    player.play();
  },

  seek(cursor: number): void {
    this.stop();
    finishTurn();
    actions.seek(cursor);
  },

  /** True while a sequence is playing or paused part-way through. */
  isActive(): boolean {
    return state.status !== 'idle';
  },

  setGap(ms: number): void {
    set({ gapMs: Math.max(0, ms) });
  },
};
