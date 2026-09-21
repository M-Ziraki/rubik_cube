import { FACE_COLORS, FACE_NAMES } from '../cube/defs';
import { useI18n } from '../i18n/I18nProvider';

/**
 * A flat unfolding of the 2x2x2. Small puzzles deserve small pictures: the net
 * shows all 24 stickers at once, which is exactly what you want when you are
 * reading a path through its state graph rather than admiring the object.
 */
export function PocketNet({ stickers, size = 22, gap = 3, label }: {
  stickers: Uint8Array; size?: number; gap?: number; label?: string;
}): JSX.Element {
  const { t } = useI18n();
  // Net layout in face-grid coordinates: U above F, then L F R B in a row, D below.
  const placement: { face: number; col: number; row: number }[] = [
    { face: 0, col: 1, row: 0 }, // U
    { face: 4, col: 0, row: 1 }, // L
    { face: 2, col: 1, row: 1 }, // F
    { face: 1, col: 2, row: 1 }, // R
    { face: 5, col: 3, row: 1 }, // B
    { face: 3, col: 1, row: 2 }, // D
  ];
  const cell = size + gap;
  const faceSize = cell * 2 + gap;
  const width = faceSize * 4 + gap;
  const height = faceSize * 3 + gap;

  return (
    <div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? t('graph.pocketNet')}>
        <rect width={width} height={height} fill="none" />
        {placement.map(({ face, col, row }) => (
          <g key={face} transform={`translate(${gap + col * faceSize}, ${gap + row * faceSize})`}>
            {[0, 1, 2, 3].map((i) => {
              const r = i >> 1;
              const c = i & 1;
              const colour = FACE_COLORS[FACE_NAMES[stickers[face * 4 + i]]];
              return (
                <rect
                  key={i}
                  x={c * cell}
                  y={r * cell}
                  width={size}
                  height={size}
                  rx={Math.max(2, size * 0.16)}
                  fill={colour}
                  stroke="var(--line-strong)"
                  strokeWidth="1"
                />
              );
            })}
          </g>
        ))}
      </svg>
      {label ? <div className="card-note" style={{ textAlign: 'center' }}>{label}</div> : null}
    </div>
  );
}
