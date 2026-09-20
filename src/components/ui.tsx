import type { ReactNode } from 'react';
import { MOVE_NAMES, MOVE_FACE, FACE_COLORS, FACE_NAMES } from '../cube/defs';

export function Card({ title, note, children, className = '', actions }: {
  title?: ReactNode; note?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode;
}): JSX.Element {
  return (
    <section className={`card ${className}`}>
      {(title || note || actions) && (
        <header className="card-head">
          <div>
            {title ? <div className="card-title">{title}</div> : null}
            {note ? <div className="card-note">{note}</div> : null}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ value, label, sub }: { value: ReactNode; label: string; sub?: ReactNode }): JSX.Element {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Callout({ kind = 'info', title, children }: {
  kind?: 'info' | 'warn' | 'danger'; title?: string; children: ReactNode;
}): JSX.Element {
  return (
    <div className={`callout ${kind === 'info' ? '' : kind}`}>
      {title ? <h4>{title}</h4> : null}
      {children}
    </div>
  );
}

export function MoveChip({ move, state = 'plain', onClick, title }: {
  move: number; state?: 'plain' | 'current' | 'done' | 'future'; onClick?: () => void; title?: string;
}): JSX.Element {
  const face = FACE_NAMES[MOVE_FACE[move]];
  return (
    <button
      type="button"
      className={`move-chip ${state === 'plain' ? 'plain' : state}`}
      onClick={onClick}
      title={title}
      disabled={!onClick}
      style={state === 'plain' || state === 'future'
        ? { borderBottom: `2px solid ${FACE_COLORS[face]}` }
        : undefined}
    >
      {MOVE_NAMES[move]}
    </button>
  );
}

export function Sequence({ moves, cursor, onSeek, empty = 'no moves yet' }: {
  moves: number[]; cursor?: number; onSeek?: (i: number) => void; empty?: string;
}): JSX.Element {
  if (moves.length === 0) return <div className="seq-empty">{empty}</div>;
  return (
    <div className="seq">
      {moves.map((m, i) => (
        <MoveChip
          key={i}
          move={m}
          state={cursor === undefined ? 'plain' : i < cursor ? 'done' : i === cursor ? 'current' : 'future'}
          onClick={onSeek ? () => onSeek(i + 1) : undefined}
          title={`move ${i + 1}`}
        />
      ))}
    </div>
  );
}

export function Meter({ value, max = 1, label }: { value: number; max?: number; label?: string }): JSX.Element {
  const pct = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  return (
    <div>
      {label ? <div className="card-note" style={{ marginBottom: 4 }}>{label}</div> : null}
      <div className="meter"><i style={{ width: `${pct * 100}%` }} /></div>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function formatBig(n: number | bigint): string {
  return n.toLocaleString('en-US');
}

export function formatApprox(n: number): string {
  if (n < 1000) return String(n);
  const units = [
    { v: 1e18, s: 'quintillion' }, { v: 1e15, s: 'quadrillion' },
    { v: 1e12, s: 'trillion' }, { v: 1e9, s: 'billion' }, { v: 1e6, s: 'million' },
    { v: 1e3, s: 'thousand' },
  ];
  for (const u of units) {
    if (n >= u.v) return `${(n / u.v).toFixed(n / u.v >= 100 ? 0 : 1)} ${u.s}`;
  }
  return String(n);
}

/** Search node counts, readable at every scale. */
export function formatNodes(n: number): string {
  if (n < 10000) return n.toLocaleString('en-US');
  if (n < 1e6) return `${(n / 1e3).toFixed(0)}k`;
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)}M`;
  return `${(n / 1e9).toFixed(1)}B`;
}
