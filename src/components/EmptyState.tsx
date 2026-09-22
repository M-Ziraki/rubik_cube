/**
 * Nothing here yet, and what to do about it.
 *
 * Empty states were a `card-note` paragraph in some places and a centred
 * glyph in others, and in a couple of places they were nothing at all - a
 * card with a title and a blank body, which reads as a bug rather than as a
 * state. One component, so an empty panel always explains itself and, where
 * there is something useful to do, offers it.
 */

import { type ReactNode } from 'react';

export function EmptyState({ glyph = '◎', title, children, action }: {
  /** A quiet mark. Decorative, and hidden from assistive technology. */
  glyph?: string;
  title?: ReactNode;
  children?: ReactNode;
  /** The one thing worth doing from here, when there is one. */
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="empty-state">
      <span className="empty-glyph" aria-hidden="true">{glyph}</span>
      {title ? <strong className="empty-title">{title}</strong> : null}
      {children ? <p className="card-note empty-body">{children}</p> : null}
      {action}
    </div>
  );
}
