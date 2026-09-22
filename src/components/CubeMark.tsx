/**
 * The two pieces of cube iconography in the whole application.
 *
 * That number is the point. A product about a Rubik's cube can carry its
 * identity in geometry, proportion and a reserved palette without printing a
 * cube on every surface, and an interface that does print one on every surface
 * has spent its attention budget on decoration. So there is a mark, and there
 * is a loading state, and everywhere else the identity comes from the scale
 * and the colours in `theme.css`.
 */

import { useI18n } from '../i18n/I18nProvider';

/**
 * An isometric cube, drawn as three faces of a 2x2 rather than a 3x3.
 *
 * A 3x3 at 28 pixels is nine indistinguishable smudges; a 2x2 keeps its
 * structure at favicon size and still reads as the same object. The three
 * visible faces carry three of the six sticker colours, which is the only
 * place in the chrome those colours appear.
 */
export function CubeMark({ size = 28, title }: { size?: number; title?: string }): JSX.Element {
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32"
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}
      className="cube-mark"
    >
      {/*
        The white face has almost no contrast against the paper the mark sits
        on, so the silhouette is outlined in ink rather than left to the fills
        to describe. Without it the mark reads as two coloured shapes and a
        hole.
      */}
      <g strokeLinejoin="round">
        <path d="M16 3.4 26.8 9.6 16 15.8 5.2 9.6Z" fill="var(--face-u)" />
        <path d="M5.2 9.6 16 15.8v12.4L5.2 22Z" fill="var(--face-f)" />
        <path d="M26.8 9.6 16 15.8v12.4L26.8 22Z" fill="var(--face-r)" />
        {/* One cut across each visible face: enough to say "subdivided"
            without drawing nine cells nobody can resolve at this size. */}
        <g stroke="var(--ink)" strokeWidth="0.8" opacity="0.32" fill="none">
          <path d="M10.6 6.5 21.4 12.7M21.4 6.5 10.6 12.7" />
          <path d="M10.6 12.7v12.4M5.2 15.8 16 22" />
          <path d="M21.4 12.7v12.4M26.8 15.8 16 22" />
        </g>
        <path
          d="M16 3.4 26.8 9.6v12.4L16 28.2 5.2 22V9.6ZM5.2 9.6 16 15.8l10.8-6.2M16 15.8v12.4"
          fill="none" stroke="var(--ink)" strokeWidth="1.1" strokeLinecap="round" opacity="0.75"
        />
      </g>
    </svg>
  );
}

/**
 * Nine cells that fill as the lookup tables are built.
 *
 * It replaced a generic progress bar, and it is not decoration: the fraction
 * it draws is the solver's real progress through its four tables, so a cell
 * lighting up means a table finished. A loading state that invents its own
 * pace is a lie told to pass the time.
 */
export function FaceletLoader({ fraction, label }: { fraction: number; label: string }): JSX.Element {
  const { t } = useI18n();
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * 9);
  return (
    <div className="facelet-loader" role="progressbar"
      aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100}
      aria-label={label}
    >
      <div className="facelet-grid" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={`facelet${i < filled ? ' on' : ''}`} />
        ))}
      </div>
      <span className="card-note">{label}</span>
      <span className="sr-only">{t('chrome.percentDone', { n: Math.round(fraction * 100) })}</span>
    </div>
  );
}
