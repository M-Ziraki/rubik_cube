/**
 * The eighteen turns, as one component.
 *
 * There were three of these: one here, one inside the Atlas that added a hover
 * preview, and one hand-written inside the sticker-map lesson. They drifted -
 * different headers, different gaps, different keyboard behaviour - which is
 * most of why the application read as a set of pages rather than one product.
 * The differences that were real are props; the rest were accidents.
 */

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

export interface MovePadProps {
  onMove: (move: number) => void;
  disabled?: boolean;
  /** Bind the letter shortcuts. Off where another surface owns the keyboard. */
  keyboard?: boolean;
  /**
   * Called as the pointer or focus moves over a turn, and with null when it
   * leaves. Supplying it turns the pad into a preview surface: the caller can
   * light up the twenty stickers the turn would move before it happens.
   */
  onPreview?: (move: number | null) => void;
  /**
   * How each column is labelled. A colour bar where the cube is beside the pad
   * and the colour is the faster read; the letter where the pad stands alone.
   */
  header?: 'colour' | 'letter';
  /** Hide the shortcut legend where the surrounding text already explains it. */
  hint?: boolean;
}

export function MovePad({
  onMove, disabled = false, keyboard = true, onPreview,
  header = 'colour', hint = true,
}: MovePadProps): JSX.Element {
  const { t } = useI18n();

  useEffect(() => {
    if (!keyboard || disabled) return undefined;
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.closest('[role="dialog"]')) return;
      const move = KEY_MAP[e.key.toLowerCase()];
      if (move === undefined) return;
      e.preventDefault();
      onMove(move);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onMove, disabled, keyboard]);

  /*
   * Every way out of a button clears the preview - leave, blur, and the click
   * itself - because a preview that outlives the pointer leaves the cube drawn
   * with twenty stickers lit and thirty-four faded, which is what the
   * "stickers lost their colour" report turned out to be.
   */
  const clear = (): void => onPreview?.(null);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="move-pad" onMouseLeave={clear} onPointerLeave={clear}>
        {[0, 1, 2, 3, 4, 5].map((face) => (
          <div key={face} className="move-pad-col">
            {header === 'colour' ? (
              <div className="move-pad-swatch" style={{ background: FACE_COLORS[FACE_NAMES[face]] }} />
            ) : (
              <div className="card-note mono-ltr move-pad-letter">{FACE_NAMES[face]}</div>
            )}
            {[0, 1, 2].map((p) => {
              const move = face * 3 + p;
              return (
                <button
                  key={move}
                  type="button"
                  className="move-chip mono-ltr"
                  disabled={disabled}
                  title={describeMove(move, t)}
                  onMouseEnter={() => onPreview?.(move)}
                  onMouseLeave={clear}
                  onFocus={() => onPreview?.(move)}
                  onBlur={clear}
                  onClick={() => { clear(); onMove(move); }}
                >
                  {MOVE_NAMES[move]}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {keyboard && hint ? (
        <div className="card-note">
          {t('movepad.keyboard')}{' '}
          <bdi className="mono-ltr">U I J · R E F · T Y G · D S C · L K M · B N V</bdi>
        </div>
      ) : null}
    </div>
  );
}
