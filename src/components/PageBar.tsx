/**
 * The header a tool gets, as opposed to the header an essay gets.
 *
 * Measured on the page it replaced: the Atlas's title, eyebrow and five-line
 * introduction pushed Scramble, Solve and the transport to y=1045 on a
 * 1000-pixel-tall window and y=1505 on a phone. The verbs of the workspace
 * were below the fold on every device, which is the most expensive kind of
 * discoverability failure - the feature is not hidden in a menu, it is simply
 * not on the screen.
 *
 * So a workspace gets this instead: one line with the name, the live state of
 * the thing being worked on, and the two or three actions that matter, sticky
 * at the top. The introduction is not deleted - a first-time learner still
 * needs it - it moves into a disclosure beside the title, which is
 * progressive disclosure doing what it is for: the explanation stays one click
 * away forever instead of costing three hundred pixels forever.
 */

import { useId, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';

export function PageBar({ title, status, about, actions, children }: {
  title: string;
  /** Live state of the workspace - solved, seven moves in, table building. */
  status?: ReactNode;
  /** The introduction, behind a disclosure. */
  about?: ReactNode;
  /** Primary verbs. Kept to three; the rest belong in the workspace. */
  actions?: ReactNode;
  /** A second row, for anything contextual like an errand banner. */
  children?: ReactNode;
}): JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="page-bar">
      <div className="page-bar-row">
        <div className="page-bar-title">
          <h1>{title}</h1>
          {status ? <span className="page-bar-status">{status}</span> : null}
        </div>
        <div className="page-bar-actions">
          {actions}
          {about ? (
            <button
              className="btn ghost small"
              aria-expanded={open}
              aria-controls={id}
              data-page-bar="about"
              onClick={() => setOpen((v) => !v)}
            >
              {t(open ? 'chrome.hideAbout' : 'chrome.about')}
            </button>
          ) : null}
        </div>
      </div>
      {about && open ? (
        <div className="page-bar-about" id={id}>{about}</div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * The way back from an errand.
 *
 * A lesson can send a learner to the Atlas with a demonstration set up. Without
 * this they arrive somewhere else entirely, with no idea which of the twelve
 * lessons they came from, and the lesson is abandoned rather than finished.
 */
export function ErrandBar({ fromKey, aboutKey, onReturn }: {
  fromKey: string; aboutKey: string; onReturn: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="errand-bar" data-errand="bar">
      <span className="errand-text">
        {t('errand.demonstrating', { about: t(aboutKey) })}
      </span>
      <button className="btn small" data-errand="return" onClick={onReturn}>
        <span className="tdir" aria-hidden="true">◀</span>{' '}
        {t('errand.back', { from: t(fromKey) })}
      </button>
    </div>
  );
}
