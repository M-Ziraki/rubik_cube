/**
 * A panel that overlays the page: the assistant, the command palette, the
 * mobile "more" menu.
 *
 * Three things every one of them has to get right, and which are easy to get
 * wrong separately in three places:
 *
 *  - Escape closes it, and focus goes back to whatever opened it. Losing focus
 *    to <body> strands a keyboard user at the top of the document.
 *  - Tab stays inside while it is open, because a dialog you can tab behind is
 *    a dialog a screen-reader user cannot tell they have left.
 *  - It is labelled, so it is announced as something rather than as a group of
 *    anonymous buttons.
 *
 * Deliberately not a <dialog>: `showModal` moves the element to the top layer,
 * which puts it outside the document's `dir` inheritance in some engines and
 * makes the docked, non-modal desktop variant impossible.
 */

import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', 'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Sheet({ open, onClose, label, side = 'end', children, className = '', modal = true }: {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Required - an unnamed dialog is an unusable one. */
  label: string;
  side?: 'end' | 'centre';
  children: ReactNode;
  className?: string;
  /** False for the docked desktop assistant, which does not trap focus. */
  modal?: boolean;
}): JSX.Element | null {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement as HTMLElement | null;

    // Focus the first thing inside, so the next Tab is inside too.
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !modal || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault(); lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault(); firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Only take focus back if it is still somewhere in here; if the panel
      // sent the learner to a button on the page, leave them there.
      if (panel.current?.contains(document.activeElement)) opener.current?.focus();
    };
  }, [open, onClose, modal]);

  if (!open) return null;

  return (
    <>
      {modal ? <div className="scrim" onClick={onClose} aria-hidden="true" /> : null}
      <div
        ref={panel}
        className={`sheet sheet-${side} ${className}`}
        role="dialog"
        aria-modal={modal}
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </>
  );
}
