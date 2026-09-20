import { useEffect } from 'react';
import { FACE_COLORS, FACE_NAMES, MOVE_NAMES } from '../cube/defs';
import { describeMove } from '../cube/notation';

const KEY_MAP: Record<string, number> = {
  u: 0, i: 2, j: 1,      // U  U'  U2
  r: 3, e: 5, f: 4,      // R  R'  R2
  t: 6, y: 8, g: 7,      // F  F'  F2
  d: 9, s: 11, c: 10,    // D  D'  D2
  l: 12, k: 14, m: 13,   // L  L'  L2
  b: 15, n: 17, v: 16,   // B  B'  B2
};

export function MovePad({ onMove, disabled = false, keyboard = true }: {
  onMove: (move: number) => void; disabled?: boolean; keyboard?: boolean;
}): JSX.Element {
  useEffect(() => {
    if (!keyboard || disabled) return undefined;
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const move = KEY_MAP[e.key.toLowerCase()];
      if (move === undefined) return;
      e.preventDefault();
      onMove(move);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onMove, disabled, keyboard]);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {[0, 1, 2, 3, 4, 5].map((face) => (
          <div key={face} style={{ display: 'grid', gap: 4 }}>
            <div style={{
              height: 4, borderRadius: 2, background: FACE_COLORS[FACE_NAMES[face]],
            }} />
            {[0, 1, 2].map((p) => {
              const move = face * 3 + p;
              return (
                <button
                  key={move}
                  type="button"
                  className="move-chip"
                  disabled={disabled}
                  onClick={() => onMove(move)}
                  title={describeMove(move)}
                  style={{ width: '100%' }}
                >
                  {MOVE_NAMES[move]}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {keyboard ? (
        <div className="card-note">
          Keyboard: <kbd>U</kbd>/<kbd>I</kbd>/<kbd>J</kbd> for U U&rsquo; U2, and likewise
          {' '}<kbd>R E F</kbd>, <kbd>T Y G</kbd>, <kbd>D S C</kbd>, <kbd>L K M</kbd>, <kbd>B N V</kbd>.
          You can also drag a layer directly on the cube.
        </div>
      ) : null}
    </div>
  );
}
