import { useEffect, useRef } from 'react';
import { CubeScene } from '../three/cubeScene';
import { MOVE_INVERSE } from '../cube/defs';
import { actions, currentFacelets, getState, subscribe, useAppState } from '../state/store';

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
 * Bridges the Three.js scene to the store. The store is the single source of
 * truth; this component only decides whether a change should be animated as a
 * single turn or snapped to instantly.
 */
export function Cube3D({
  facelets, interactive = true, className, height, onUserMove,
  onStickerPick, onStickerHover, emphasis = null, selected = null,
}: Cube3DProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CubeScene | null>(null);
  const lastRef = useRef({ origin: '', cursor: -1 });
  const turnSpeed = useAppState((s) => s.turnSpeed);
  // Callbacks live in a ref so changing them never tears down the WebGL scene.
  const cbRef = useRef({ onUserMove, onStickerPick, onStickerHover });
  cbRef.current = { onUserMove, onStickerPick, onStickerHover };

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const scene = new CubeScene(hostRef.current, {
      interactive,
      onUserMove: (move) => {
        if (cbRef.current.onUserMove) cbRef.current.onUserMove(move);
        else actions.applyMove(move);
      },
      onStickerPick: (f) => cbRef.current.onStickerPick?.(f),
      onStickerHover: (f) => cbRef.current.onStickerHover?.(f),
    });
    sceneRef.current = scene;
    scene.setTurnSpeed(getState().turnSpeed);
    if (facelets) scene.setFacelets(facelets);
    else {
      scene.setFacelets(currentFacelets(getState()));
      lastRef.current = { origin: getState().origin, cursor: getState().cursor };
    }
    return () => { scene.dispose(); sceneRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  useEffect(() => { sceneRef.current?.setTurnSpeed(turnSpeed); }, [turnSpeed]);

  useEffect(() => { sceneRef.current?.setEmphasis(emphasis ?? null); }, [emphasis]);
  useEffect(() => { sceneRef.current?.setSelected(selected); }, [selected]);

  // Controlled mode: follow the given string exactly.
  useEffect(() => {
    if (facelets && sceneRef.current) sceneRef.current.setFacelets(facelets);
  }, [facelets]);

  // Store mode: animate single steps, snap for anything else.
  useEffect(() => {
    if (facelets) return undefined;
    const sync = (): void => {
      const scene = sceneRef.current;
      if (!scene) return;
      const s = getState();
      const target = currentFacelets(s);
      const last = lastRef.current;
      if (s.origin !== last.origin || Math.abs(s.cursor - last.cursor) > 1) {
        scene.setFacelets(target);
      } else if (s.cursor === last.cursor + 1) {
        scene.playMove(s.moves[s.cursor - 1], target);
      } else if (s.cursor === last.cursor - 1) {
        scene.playMove(MOVE_INVERSE[s.moves[s.cursor]], target);
      }
      lastRef.current = { origin: s.origin, cursor: s.cursor };
    };
    sync();
    return subscribe(sync);
  }, [facelets]);

  return (
    <div
      ref={hostRef}
      className={className ?? 'scene-host'}
      style={height ? { height, aspectRatio: 'auto' } : undefined}
    />
  );
}
