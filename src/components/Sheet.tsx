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

    /*
     * A modal overlay has to stop the page behind it, in three senses that
     * are easy to confuse and were all missing:
     *
     *  - it must not scroll, or dismissing the dialog leaves you somewhere
     *    else entirely;
     *  - it must not be clickable, which the scrim already handles;
     *  - it must not be *readable*, which the scrim does not handle at all.
     *    `inert` is the only thing that takes the content behind out of the
     *    accessibility tree as well as out of the tab order, so a screen
     *    reader stops walking a page its user cannot act on.
     */
    // The overlay renders inside the same React tree as the page, so "every
    // child of <body> that is not the panel" would match nothing. The shell
    // marks the regions that a modal overlay covers instead.
    const behind = modal
      ? [...document.querySelectorAll<HTMLElement>('[data-overlay-blocks]')]
      : [];
    const scrollY = window.scrollY;
    if (modal) {
      for (const el of behind) el.inert = true;
      document.body.style.overflow = 'hidden';
    }

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
      if (modal) {
        for (const el of behind) el.inert = false;
        document.body.style.overflow = '';
        // Restoring `overflow` can nudge the scroll position; put it back.
        window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
      }
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
