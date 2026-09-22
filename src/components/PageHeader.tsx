/**
 * The header a reading page gets.
 *
 * Eight pages had hand-written this same three-element block, and they had
 * already drifted in the margin between the lede and whatever came next. It
 * is the counterpart to `PageBar`, which is what a workspace gets: the two
 * together are the whole page-layout contract, and a page picks the one that
 * matches what it is for rather than inventing a third.
 */

import { type ReactNode } from 'react';

export function PageHeader({ eyebrow, title, lede, children }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Progress, a tab strip, a resume button - whatever the page leads with. */
  children?: ReactNode;
}): JSX.Element {
  return (
    <header className="page-head">
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <h1>{title}</h1>
      {lede ? <p className="lede">{lede}</p> : null}
      {children ? <div className="page-head-extra">{children}</div> : null}
    </header>
  );
}
