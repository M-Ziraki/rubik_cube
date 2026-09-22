/**
 * Switching between views of one page.
 *
 * `Segmented` was doing this job as well as its own. They look alike and are
 * not alike: a segmented control picks a *value* - a playback speed, a theme,
 * a language - and a tab strip picks which *content* is on screen. The
 * difference is not cosmetic. A tab strip has to tell assistive technology
 * that it controls a region, name that region, and answer the arrow keys,
 * because a screen-reader user who lands on "Progress" needs to know there is
 * a panel attached to it. None of that was happening.
 *
 * `Segmented` keeps the value-picking job and loses this one.
 */

import { useId, type ReactNode } from 'react';

export interface Tab<T extends string> {
  id: T;
  label: ReactNode;
  /** Shown under the strip, for a tab whose purpose is not obvious. */
  note?: ReactNode;
}

export function Tabs<T extends string>({ value, tabs, onChange, label }: {
  value: T;
  tabs: readonly Tab<T>[];
  onChange: (id: T) => void;
  /** Names the strip itself, so it is not announced as an anonymous group. */
  label: string;
}): JSX.Element {
  const base = useId();
  const index = tabs.findIndex((x) => x.id === value);
  const active = tabs[index] ?? tabs[0];

  /*
   * Arrow keys move between tabs and wrap, which is what the pattern
   * specifies and what anyone who has used a tab strip expects. Home and End
   * jump to the ends; the rest of the keyboard is left alone.
   */
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const last = tabs.length - 1;
    let next = -1;
    if (e.key === 'ArrowRight') next = index >= last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index <= 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`${base}-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div className="tabs">
      <div className="seg" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${base}-tab-${tab.id}`}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={tab.id === value}
            aria-controls={`${base}-panel-${tab.id}`}
            // Only the selected tab is a tab stop; the arrows do the rest.
            tabIndex={tab.id === value ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active?.note ? <div className="card-note tabs-note">{active.note}</div> : null}
    </div>
  );
}

/** The region a tab controls. Rendered by the page, named by the tab. */
export function TabPanel({ children }: { children: ReactNode }): JSX.Element {
  return <div className="tab-panel">{children}</div>;
}
