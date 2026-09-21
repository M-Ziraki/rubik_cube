/**
 * "Explain it in your own words", with a diagnosis when one is available.
 *
 * Writing an explanation and comparing it against a worked answer is a real
 * study technique on its own, which is why this exercise exists in both modes.
 * What Jev adds is the *reading*: given the words, which of a fixed set of
 * misconceptions does this look like, so the application can show the
 * explanation that addresses it rather than the generic one.
 *
 * The three rules that keep it honest:
 *  - the learner sees the model answer either way, so nothing is gated on AI;
 *  - a diagnosis is labelled as a judgment, never as a verdict;
 *  - the learner can reject it, and rejecting it opens the full material.
 */

import { useRef, useState } from 'react';
import { Callout, Card } from '../components/ui';
import { JevBadge, JevFailure, JevThinking } from './JevBadge';
import { T, useI18n } from '../i18n/I18nProvider';
import { useJevTask } from '../jev/useJevTask';
import { REMEDIES } from '../jev/content';
import { MISCONCEPTION_LABELS, type MisconceptionDecision, type MisconceptionLabel } from '../jev/protocol';
import { parseSequence } from '../cube/notation';
import { actions } from '../state/store';
import { player } from '../state/player';

export interface ConceptCheckProps {
  /** One of the curated prompts in `questions.ts`. */
  promptId: string;
  /** Points a good answer makes, for the self-check. i18n keys. */
  rubric: readonly string[];
}

export function ConceptCheck({ promptId, rubric }: ConceptCheckProps): JSX.Element {
  const { t, lang } = useI18n();
  const task = useJevTask<MisconceptionDecision>();
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [disputed, setDisputed] = useState(false);
  const [override, setOverride] = useState<MisconceptionLabel | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = (): void => {
    if (!answer.trim()) return;
    setSubmitted(true);
    setDisputed(false);
    setOverride(null);
    if (task.available) {
      void task.run({ task: 'misconception', promptId, answer: answer.trim(), language: lang });
    }
  };

  const reset = (): void => {
    task.cancel();
    setSubmitted(false);
    setDisputed(false);
    setOverride(null);
    setAnswer('');
    textRef.current?.focus();
  };

  const decision = task.decision;
  const label: MisconceptionLabel | null = override
    ?? (decision && !disputed ? decision.label : null);
  const remedy = label ? REMEDIES[label] : null;

  const runDemo = (sequence: string): void => {
    player.yieldToUser();
    actions.applyMoves(parseSequence(sequence).moves);
  };

  return (
    <Card
      title={t('jev.check.title')}
      note={task.available ? t('jev.check.noteAi') : t('jev.check.noteSelf')}
      className="stack"
    >
      {/* Prose that can contain move notation goes through <T>, which keeps
          `R U R'` reading left to right inside a right-to-left paragraph. */}
      <p style={{ margin: 0 }}><T k={`jev.prompt.${promptId}`} /></p>

      <textarea
        ref={textRef}
        rows={4}
        value={answer}
        disabled={submitted}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder={t('jev.check.placeholder')}
        aria-label={t('jev.check.title')}
      />

      {!submitted ? (
        <div className="row">
          <button className="btn primary" onClick={submit} disabled={!answer.trim()}>
            {task.available ? t('jev.check.submitAi') : t('jev.check.submitSelf')}
          </button>
          {!task.available ? (
            <span className="card-note">{t('jev.check.selfHint')}</span>
          ) : null}
        </div>
      ) : (
        <div className="row">
          <button className="btn ghost" onClick={reset}>{t('jev.check.again')}</button>
        </div>
      )}

      {submitted && task.phase === 'thinking' ? <JevThinking /> : null}

      {submitted && task.phase === 'failed' ? (
        <>
          <JevFailure
            code={task.error ?? 'server'}
            retryAfter={task.retryAfter}
            onRetry={task.available ? submit : undefined}
          />
          <p className="card-note" style={{ margin: 0 }}>{t('jev.check.fellBack')}</p>
        </>
      ) : null}

      {/* The diagnosis, when there is one and the learner has not rejected it. */}
      {submitted && decision && label && remedy ? (
        <Callout kind={label === 'correct' ? 'info' : 'warn'} title={t(`jev.label.${label}`)}>
          <div className="row tight" style={{ marginBottom: 8 }}>
            <JevBadge source={override ? 'deterministic' : decision.source} confidence={decision.confidence} />
            {decision.source === 'jev-uncertain' ? (
              <span className="card-note">{t('jev.check.uncertain')}</span>
            ) : null}
          </div>
          <p style={{ marginBottom: remedy.demo || remedy.route ? 8 : 0 }}>
            <T k={remedy.explanation} />
          </p>
          <div className="row tight">
            {remedy.demo ? (
              <button className="btn small" onClick={() => runDemo(remedy.demo as string)}>
                {t('jev.check.watchIt')} <bdi className="mono-ltr">{remedy.demo}</bdi>
              </button>
            ) : null}
            {remedy.route ? (
              <a className="btn small ghost" href={remedy.route}>
                {t(remedy.routeLabel ?? 'jev.check.readMore')}
              </a>
            ) : null}
          </div>
        </Callout>
      ) : null}

      {/* Disputing a diagnosis is a first-class action, not a complaint form. */}
      {submitted && decision && !disputed && !override ? (
        <div className="row tight">
          <span className="card-note">{t('jev.check.disagree')}</span>
          <button className="btn small ghost" onClick={() => setDisputed(true)}>
            {t('jev.check.disagreeButton')}
          </button>
        </div>
      ) : null}

      {/* The self-check: shown when there is no AI, and whenever the learner
          rejects a diagnosis. It is the complete material either way. */}
      {submitted && (disputed || !task.available || (task.phase === 'failed' && !decision)) ? (
        <div className="stack" style={{ gap: 8 }}>
          <Callout title={t('jev.check.modelAnswer')}>
            <p style={{ marginBottom: 8 }}><T k={`jev.answer.${promptId}`} /></p>
            <div className="card-note" style={{ marginBottom: 4 }}>{t('jev.check.rubric')}</div>
            <ul style={{ margin: 0 }}>
              {rubric.map((key) => <li key={key}><T k={key} /></li>)}
            </ul>
          </Callout>
          {disputed ? (
            <div>
              <div className="card-note" style={{ marginBottom: 6 }}>{t('jev.check.pickCorrect')}</div>
              <div className="row tight">
                {MISCONCEPTION_LABELS.filter((l) => l !== 'unrelated').map((l) => (
                  <button key={l} className="btn small ghost" onClick={() => setOverride(l)}>
                    {t(`jev.label.${l}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
