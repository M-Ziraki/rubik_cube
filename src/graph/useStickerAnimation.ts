/**
 * Drives the sticker map from the same store the 3D cube uses, so the two
 * always show the same turn at the same moment.
 *
 * The store holds a start position, a list of moves and a cursor. Whenever the
 * cursor steps by one, this hook plays that single move; any larger jump snaps,
 * because scrubbing through a solution should not queue up twenty animations.
 */

import { useEffect, useRef, useState } from 'react';
import { MOVE_INVERSE } from '../cube/defs';
import { currentFacelets, getState, subscribe } from '../state/store';

export interface StickerAnimation {
  facelets: string;
  previousFacelets: string;
  move: number | null;
  progress: number;
}

export function useStickerAnimation(speedMs?: number): StickerAnimation {
  const [anim, setAnim] = useState<StickerAnimation>(() => {
    const f = currentFacelets(getState());
    return { facelets: f, previousFacelets: f, move: null, progress: 1 };
  });
  const last = useRef({ origin: getState().origin, cursor: getState().cursor });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const stop = (): void => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };

    const play = (from: string, to: string, move: number, duration: number): void => {
      stop();
      const started = performance.now();
      const tick = (now: number): void => {
        const t = duration <= 0 ? 1 : Math.min(1, (now - started) / duration);
        // Same easing as the 3D turn, so the two finish together.
        const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        setAnim({ facelets: to, previousFacelets: from, move, progress: eased });
        if (t < 1) raf.current = requestAnimationFrame(tick);
        else { raf.current = null; setAnim({ facelets: to, previousFacelets: to, move: null, progress: 1 }); }
      };
      raf.current = requestAnimationFrame(tick);
    };

    const sync = (): void => {
      const s = getState();
      const to = currentFacelets(s);
      const prev = last.current;
      const duration = speedMs ?? s.turnSpeed;
      if (s.origin !== prev.origin || Math.abs(s.cursor - prev.cursor) > 1) {
        stop();
        setAnim({ facelets: to, previousFacelets: to, move: null, progress: 1 });
      } else if (s.cursor === prev.cursor + 1) {
        const from = currentFacelets({ ...s, cursor: s.cursor - 1 });
        play(from, to, s.moves[s.cursor - 1], duration);
      } else if (s.cursor === prev.cursor - 1) {
        const from = currentFacelets({ ...s, cursor: s.cursor + 1 });
        play(from, to, MOVE_INVERSE[s.moves[s.cursor]], duration);
      }
      last.current = { origin: s.origin, cursor: s.cursor };
    };

    sync();
    const unsub = subscribe(sync);
    return () => { unsub(); stop(); };
  }, [speedMs]);

  return anim;
}
