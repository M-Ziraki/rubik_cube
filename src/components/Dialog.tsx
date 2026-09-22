/**
 * A real dialog, for the one place that was using the browser's.
 *
 * `confirm()` is not a styling problem. It cannot be translated, so a Persian
 * learner was asked to discard their progress in English; it cannot be
 * themed, so it arrives as a grey system box in the middle of a dark page;
 * and it blocks the main thread, which stops the turn clock mid-animation.
 *
 * Built on `Sheet`, so focus management, Escape, the scrim and the scroll
 * lock are the same code as every other overlay rather than a second
 * implementation that will drift from it.
 */

import { type ReactNode } from 'react';
import { Sheet } from './Sheet';
import { useI18n } from '../i18n/I18nProvider';

export function Dialog({
  open, onClose, title, children, confirmLabel, onConfirm, tone = 'normal', cancelLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  /** Omit to make this an acknowledgement rather than a decision. */
  confirmLabel?: string;
  onConfirm?: () => void;
  /** `danger` for anything that destroys work the learner cannot get back. */
  tone?: 'normal' | 'danger';
  cancelLabel?: string;
}): JSX.Element | null {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} label={title} side="centre" className="dialog" modal>
      <div className="dialog-body">
        <h2 className="dialog-title">{title}</h2>
        {children}
      </div>
      <footer className="dialog-foot">
        <button className="btn" data-dialog="cancel" onClick={onClose}>
          {cancelLabel ?? t('common.cancel')}
        </button>
        {confirmLabel && onConfirm ? (
          <button
            className={`btn ${tone === 'danger' ? 'danger' : 'primary'}`}
            data-dialog="confirm"
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel}
          </button>
        ) : null}
      </footer>
    </Sheet>
  );
}
