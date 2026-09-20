import { FACE_COLORS, FACE_COLOR_NAMES, FACE_NAMES, type FaceName } from '../cube/defs';

/**
 * A flat net for typing in the colours of a real cube.
 *
 * Centres are fixed and unclickable on purpose: on a physical cube the centres
 * cannot move relative to each other, so they define the colour scheme. Making
 * that un-editable removes a whole category of mistakes before it happens.
 */
export function ColorGrid({ facelets, brush, onPaint, size = 30 }: {
  facelets: Uint8Array;
  brush: number;
  onPaint: (index: number, face: number) => void;
  size?: number;
}): JSX.Element {
  const gap = 3;
  const cell = size + gap;
  const faceSize = cell * 3 + gap;
  const layout: { face: number; col: number; row: number }[] = [
    { face: 0, col: 1, row: 0 },
    { face: 4, col: 0, row: 1 },
    { face: 2, col: 1, row: 1 },
    { face: 1, col: 2, row: 1 },
    { face: 5, col: 3, row: 1 },
    { face: 3, col: 1, row: 2 },
  ];
  const width = faceSize * 4 + gap;
  const height = faceSize * 3 + gap;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width, display: 'block' }}>
      {layout.map(({ face, col, row }) => (
        <g key={face} transform={`translate(${gap + col * faceSize}, ${gap + row * faceSize})`}>
          <text
            x={cell * 1.5 - gap / 2} y={-4} textAnchor="middle"
            style={{ fontSize: 10, fill: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}
          >
            {FACE_NAMES[face]}
          </text>
          {Array.from({ length: 9 }, (_, i) => {
            const index = face * 9 + i;
            const isCentre = i === 4;
            const value = facelets[index];
            return (
              <rect
                key={i}
                x={(i % 3) * cell}
                y={Math.floor(i / 3) * cell}
                width={size}
                height={size}
                rx={Math.max(3, size * 0.17)}
                fill={FACE_COLORS[FACE_NAMES[value] as FaceName]}
                stroke={isCentre ? 'var(--ink)' : 'var(--line-strong)'}
                strokeWidth={isCentre ? 2 : 1}
                style={{ cursor: isCentre ? 'not-allowed' : 'pointer' }}
                onClick={() => { if (!isCentre) onPaint(index, brush); }}
                onPointerEnter={(e) => { if (!isCentre && e.buttons === 1) onPaint(index, brush); }}
              >
                <title>
                  {isCentre
                    ? `${FACE_NAMES[face]} centre — fixed`
                    : `${FACE_NAMES[face]}${i + 1}: ${FACE_COLOR_NAMES[FACE_NAMES[value] as FaceName]}`}
                </title>
              </rect>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

export function ColorPalette({ value, onChange }: { value: number; onChange: (f: number) => void }): JSX.Element {
  return (
    <div className="row tight">
      {FACE_NAMES.map((f, i) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(i)}
          title={`${FACE_COLOR_NAMES[f]} (the ${f} face)`}
          style={{
            width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
            background: FACE_COLORS[f],
            border: value === i ? '3px solid var(--ink)' : '1px solid var(--line-strong)',
          }}
        />
      ))}
    </div>
  );
}
