/**
 * The tutor's recommendation for what to do next.
 *
 * The interesting design decision here is that the deterministic
 * recommendation is computed every time, whether or not Jev is available, and
 * the panel shows it when the two disagree. A learner is never told only what
 * the model thinks: they are told what the rules say, what the model says, and
 * which one the application acted on.
 *
 * Prerequisites are enforced before any of that. An activity the learner is
 * not ready for is not a candidate, so no judgment can route them into one.
 */

import { useCallback, useRef, useState } from 'react';
import { Card } from './ui';
import { JevBadge, JevFailure, JevThinking } from './JevBadge';
import { useI18n } from '../i18n/I18nProvider';
import { useAppState } from '../state/store';
import { useJevTask } from '../jev/useJevTask';
import { learnerSignals } from '../jev/signals';
import { eligibleActivities, ruleBasedNextStep } from '../jev/decisions';
import { ACTIVITIES } from '../jev/questions';
import type { NextStepDecision } from '../jev/protocol';

export function TutorPanel({ compact = false }: { compact?: boolean }): JSX.Element {
  const { t, lang } = useI18n();
  const state = useAppState((s) => s);
  const task = useJevTask<NextStepDecision>();
  const [asked, setAsked] = useState(false);
  const lastRun = useRef(0);

  const signals = learnerSignals(state);
  const candidates = eligibleActivities(signals, state.progress.lessonsDone);
  const ruleChoice = ruleBasedNextStep(signals, candidates);

  const ask = useCallback(() => {
    setAsked(true);
    if (!task.available) return;
    // One recommendation per click, and never on a render. Nothing here
    // changes fast enough to justify asking again on its own.
    lastRun.current = Date.now();
    void task.run({ task: 'next-step', signals, candidates, language: lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.available, lang, JSON.stringify(signals), candidates.join(',')]);

  const decision = task.decision;
  const chosen = decision?.activity ?? ruleChoice;
  const activity = ACTIVITIES.find((a) => a.id === chosen);
  const source = decision ? decision.source : 'deterministic';
  const disagreed = decision !== null
    && decision.deterministicChoice !== decision.activity;

  return (
    <Card
      title={t('jev.tutor.title')}
      note={task.available ? t('jev.tutor.noteAi') : t('jev.tutor.noteRules')}
      className="stack"
    >
      {!asked ? (
        <>
          <p className="card-note" style={{ margin: 0 }}>{t('jev.tutor.intro')}</p>
          <div className="row">
            <button className="btn primary" data-jev="recommend" onClick={ask}>
              {t('jev.tutor.ask')}
            </button>
          </div>
        </>
      ) : null}

      {asked && task.phase === 'thinking' ? <JevThinking /> : null}

      {asked && task.phase === 'failed' ? (
        <JevFailure code={task.error ?? 'server'} retryAfter={task.retryAfter} onRetry={ask} />
      ) : null}

      {asked && task.phase !== 'thinking' && activity ? (
        <>
          <div className="row tight">
            <JevBadge source={source} confidence={decision?.confidence} />
          </div>
          <div>
            <strong>{t(`jev.activity.${activity.id}`)}</strong>
            <p className="card-note" style={{ marginTop: 4, marginBottom: 8 }}>
              {t(`jev.activity.${activity.id}.why`)}
            </p>
            <div className="row tight">
              <a className="btn" href={activity.route}>{t('jev.tutor.go')}</a>
              <button className="btn ghost small" onClick={ask}>{t('jev.tutor.again')}</button>
            </div>
          </div>

          {/* When the model and the rules disagree, say so and show both. */}
          {disagreed && decision ? (
            <div className="card-note">
              {t('jev.tutor.disagreement', {
                rule: t(`jev.activity.${decision.deterministicChoice}`),
              })}
            </div>
          ) : null}
        </>
      ) : null}

      {!compact ? (
        <details>
          <summary className="card-note">{t('jev.tutor.whatItSees')}</summary>
          <div className="scroll-x" style={{ marginTop: 8 }}>
            <table className="data">
              <tbody>
                <tr>
                  <td>{t('jev.signal.lessons')}</td>
                  <td className="num">{signals.lessonsDone} / {signals.lessonsTotal}</td>
                </tr>
                <tr><td>{t('jev.signal.attempts')}</td><td className="num">{signals.attempts}</td></tr>
                <tr><td>{t('jev.signal.optimal')}</td><td className="num">{signals.optimalSolves}</td></tr>
                <tr><td>{t('jev.signal.avgWasted')}</td><td className="num">{signals.avgWasted}</td></tr>
                <tr>
                  <td>{t('jev.signal.struggling')}</td>
                  <td>{signals.strugglingWith.length
                    ? signals.strugglingWith.map((id) => t(`lesson.${id}.title`)).join('، ')
                    : t('common.none')}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="card-note" style={{ marginTop: 8, marginBottom: 0 }}>
            {t('jev.tutor.privacy')}
          </p>
        </details>
      ) : null}
    </Card>
  );
}
