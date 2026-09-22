/**
 * The first thing a new learner sees, and the last thing they see of it.
 *
 * The research here is unusually consistent: a long onboarding tour is skipped,
 * resented and forgotten, while a small set of concrete starting points is
 * used. So this is not a tour. It is four doors, each one landing on something
 * that does something, and a dismissal that sticks.
 *
 * It appears on the Atlas, above the workspace, on a first visit only. Anyone
 * who wants it again can reopen it from the command palette, which is also
 * where every other "how do I get back to" question is answered.
 */

import { Card } from './ui';
import { CubeMark } from './CubeMark';
import { useI18n } from '../i18n/I18nProvider';
import { go } from '../state/navigation';
import { session } from '../state/session';

interface Door {
  id: string;
  to: string;
  glyph: string;
}

/**
 * Ordered by how much is assumed, least first. The fourth is the one an
 * experienced visitor takes, and it is on the same row rather than hidden
 * behind "skip", because skipping and choosing should cost the same.
 */
const DOORS: Door[] = [
  { id: 'learn', to: '#/learn/notation', glyph: '▤' },
  { id: 'explore', to: '#/cube', glyph: '◎' },
  { id: 'solve', to: '#/practise/your-cube', glyph: '◧' },
  { id: 'maths', to: '#/explore/state-space', glyph: '✳' },
];

export function Welcome(): JSX.Element {
  const { t } = useI18n();
  return (
    <Card className="welcome" style={{ marginBottom: 18 }}>
      <div className="welcome-head">
        <CubeMark size={40} />
        <div>
          <div className="eyebrow">{t('welcome.eyebrow')}</div>
          <h2 className="welcome-title">{t('welcome.title')}</h2>
          <p className="card-note welcome-lede">{t('welcome.lede')}</p>
        </div>
        <button
          className="btn ghost small"
          data-welcome="dismiss"
          onClick={() => session.dismissWelcome()}
        >
          {t('welcome.dismiss')}
        </button>
      </div>
      <div className="welcome-doors">
        {DOORS.map((d) => (
          <button
            key={d.id}
            className="welcome-door"
            data-welcome={d.id}
            onClick={() => { session.dismissWelcome(); go(d.to); }}
          >
            <span className="welcome-glyph" aria-hidden="true">{d.glyph}</span>
            <span className="welcome-door-title">{t(`welcome.door.${d.id}`)}</span>
            <span className="card-note">{t(`welcome.door.${d.id}.note`)}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
