import { useEffect, useRef } from 'react';
import { CubeScene } from '../three/cubeScene';
import { currentFacelets, getState, subscribe } from '../state/store';
import { currentTurn, subscribeTurn } from '../state/turnClock';

export interface Cube3DProps {
  /** Drive the cube from an explicit facelet string instead of the app state. */
  facelets?: string;
  interactive?: boolean;
  className?: string;
  height?: number;
  onUserMove?: (move: number) => void;
  /** Clicking a sticker reports its facelet index. */
  onStickerPick?: (facelet: number | null) => void;
  onStickerHover?: (facelet: number | null) => void;
  /** Fade every sticker except these. */
  emphasis?: Iterable<number> | null;
  /** Ring this sticker. */
  selected?: number | null;
}

/**
 * Bridges the Three.js scene to the app.
 *
 * Two sources drive it and they never overlap. `facelets` puts the component in
 * controlled mode, where it simply shows whatever string it is handed - used by
 * lessons and previews, which do not animate. Otherwise it follows the store,
 * and draws turns under the direction of the shared turn clock, which is also
 * what the sticker map listens to. Neither view owns the timing, so neither can
 * run ahead of the other.
 */
export function Cube3D({
  facelets, interactive = true, className, height, onUserMove,
  onStickerPick, onStickerHover, emphasis = null, selected = null,
}: Cube3DProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CubeScene | null>(null);
  // Callbacks live in a ref so changing them never tears down the WebGL scene.
  const cbRef = useRef({ onUserMove, onStickerPick, onStickerHover });
  cbRef.current = { onUserMove, onStickerPick, onStickerHover };

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const scene = new CubeScene(hostRef.current, {
      interactive,
      onUserMove: (move) => cbRef.current.onUserMove?.(move),
      onStickerPick: (f) => cbRef.current.onStickerPick?.(f),
      onStickerHover: (f) => cbRef.current.onStickerHover?.(f),
    });
    sceneRef.current = scene;
    // A registry of live scenes, so the rendering-consistency tests can compare
    // what is painted against the logical state. Read-only; costs nothing.
    const reg = (window as unknown as { __cubeAtlas?: Set<CubeScene> });
    reg.__cubeAtlas = reg.__cubeAtlas ?? new Set();
    reg.__cubeAtlas.add(scene);
    return () => {
      reg.__cubeAtlas?.delete(scene);
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  useEffect(() => { sceneRef.current?.setEmphasis(emphasis ?? null); }, [emphasis]);
  useEffect(() => { sceneRef.current?.setSelected(selected); }, [selected]);

  // Controlled mode: follow the given string exactly, never animate.
  useEffect(() => {
    if (facelets !== undefined) sceneRef.current?.setFacelets(facelets);
  }, [facelets]);

  // Store mode: snap to the store, and let the turn clock draw the turns.
  useEffect(() => {
    if (facelets !== undefined) return undefined;
    const scene = sceneRef.current;
    if (!scene) return undefined;

    scene.setFacelets(currentFacelets(getState()));

    const onTurn = (turn: ReturnType<typeof currentTurn>): void => {
      const s = sceneRef.current;
      if (!s) return;
      if (!turn) {
        // The turn was committed (or cancelled): show the settled position.
        s.endTurn(currentFacelets(getState()));
        return;
      }
      if (!s.isTurning) {
        s.setFacelets(turn.from);
        s.beginTurn(turn.move);
      }
      s.setTurnProgress(turn.progress);
    };

    // A store change with no turn behind it - a jump, a reset, a new scramble -
    // still has to be shown.
    const onStore = (): void => {
      const s = sceneRef.current;
      if (!s || currentTurn()) return;
      const want = currentFacelets(getState());
      if (s.getFacelets() !== want) s.setFacelets(want);
    };

    const unTurn = subscribeTurn(onTurn);
    const unStore = subscribe(onStore);
    return () => { unTurn(); unStore(); };
  }, [facelets]);

  return (
    <div
      ref={hostRef}
      className={className ?? 'scene-host'}
      style={height ? { height, aspectRatio: 'auto' } : undefined}
    />
  );
}
