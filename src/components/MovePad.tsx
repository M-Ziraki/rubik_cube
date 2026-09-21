import { useEffect } from 'react';
import { FACE_COLORS, FACE_NAMES, MOVE_NAMES } from '../cube/defs';
import { describeMove } from '../cube/notation';
import { useI18n } from '../i18n/I18nProvider';

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
  const { t } = useI18n();
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
      <div className="move-pad">
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
                  className="move-chip mono-ltr"
                  disabled={disabled}
                  onClick={() => onMove(move)}
                  title={describeMove(move, t)}
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
          {t('movepad.keyboard')}{' '}
          <bdi className="mono-ltr">U I J · R E F · T Y G · D S C · L K M · B N V</bdi>
        </div>
      ) : null}
    </div>
  );
}
