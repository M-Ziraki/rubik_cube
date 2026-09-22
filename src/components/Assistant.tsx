/**
 * The study companion: one entry point, on every page, that knows where it is.
 *
 * The integration used to be four features in four places. A learner who had
 * found the concept check in a lesson had no reason to suspect that the course
 * index could recommend a next step, and nothing at all was available from the
 * Atlas, the graph or the solver. Help that exists but cannot be found is not
 * help.
 *
 * So there is now exactly one affordance, in the same corner of every page,
 * and what is inside it changes with the page. Two things it can always do on
 * its own - recommend what to study next, and carry out a spoken instruction
 * where there is a cube to act on - and whatever the current page has
 * published, which is a shortcut into that page's own tools rather than a
 * second copy of them.
 *
 * What it is not: a chat window. Jev returns typed judgments, not prose, and
 * dressing that up as a conversation would misrepresent both what was asked
 * and what came back. Every answer here is a named decision with a visible
 * source, and every one of them has a deterministic answer underneath that is
 * computed whether or not a model was consulted.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { JevBadge, JevFailure, JevThinking } from './JevBadge';
import { T, useI18n } from '../i18n/I18nProvider';
import { useAppState } from '../state/store';
import { session, useSession } from '../state/session';
import { go, routeById, useRoute } from '../state/navigation';
import { useNarrow } from '../state/useMediaQuery';
import { useAssistantContextValue } from '../jev/assistantContext';
import { useJevTask } from '../jev/useJevTask';
import { jevActive, jevConfig, keySource, useJevConfig } from '../jev/config';
import { learnerSignals } from '../jev/signals';
import {
  eligibleActivities, ruleBasedCommand, ruleBasedNextStep,
} from '../jev/decisions';
import { ACTIVITIES } from '../jev/questions';
import {
  MUTATING_ACTIONS,
  type CommandAction, type CommandDecision, type NextStepDecision,
} from '../jev/protocol';

/* ------------------------------------------------------------ the state --- */

/**
 * Which of four situations the learner is in, as one value.
 *
 * These are genuinely different and the panel says which is true, because
 * "off" and "broken" and "no key" call for completely different next actions
 * and guessing between them wastes the learner's time.
 */
export type AssistantStatus = 'on' | 'off' | 'needs-key' | 'unavailable';

export function assistantStatus(
  config: ReturnType<typeof useJevConfig>, failedHard: boolean,
): AssistantStatus {
  if (failedHard) return 'unavailable';
  if (keySource(config) === 'none') return 'needs-key';
  return config.enabled ? 'on' : 'off';
}

/* ------------------------------------------------------------- the dock --- */

/**
 * The button. Fixed to the same corner on every page, at a size that clears
 * the 24px minimum comfortably, and sitting above the mobile tab bar rather
 * than on top of it.
 */
export function AssistantDock(): JSX.Element {
  const { t } = useI18n();
  const open = useSession((s) => s.assistantOpen);
  const config = useJevConfig();
  const [failed, setFailed] = useState(false);
  const status = assistantStatus(config, failed);

  // Cmd/Ctrl-J, and "?" - the two shortcuts people try. Bound once, here,
  // rather than in every page that happens to want help.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault(); session.toggleAssistant();
      } else if (e.key === '?' && !typing) {
        e.preventDefault(); session.setAssistantOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        className="assistant-dock"
        data-assistant="dock"
        aria-expanded={open}
        aria-controls="assistant-panel"
        onClick={() => session.toggleAssistant()}
        title={t('assist.shortcut')}
      >
        <span className={`assistant-dot ${status}`} aria-hidden="true" />
        <span className="assistant-dock-label">{t('assist.open')}</span>
        <span className="assistant-glyph" aria-hidden="true">◇</span>
      </button>
      <AssistantPanel open={open} status={status} onHardFailure={setFailed} />
    </>
  );
}

/* ------------------------------------------------------------ the panel --- */

function AssistantPanel({ open, status, onHardFailure }: {
  open: boolean; status: AssistantStatus; onHardFailure: (v: boolean) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const route = useRoute();
  const ctx = useAssistantContextValue();
  const def = routeById(route);
  /*
   * Modal on a phone, where a bottom sheet over a scrim is what the gesture
   * means and there is no room for two things at once. Not modal on a wide
   * screen: the panel is docked beside the workspace, and a learner who opens
   * it to ask what to do next must still be able to turn the cube they are
   * asking about. Help that stops the page is not help.
   */
  const narrow = useNarrow();

  return (
    <Sheet
      open={open}
      onClose={() => session.setAssistantOpen(false)}
      label={t('assist.title')}
      className="assistant-panel"
      modal={narrow}
    >
      <div id="assistant-panel" className="assistant-inner">
        <header className="assistant-head">
          <div>
            <div className="card-title">{t('assist.title')}</div>
            <div className="card-note">
              {t('assist.youAreIn', { page: t(ctx.actions.length ? ctx.labelKey : def.labelKey) })}
            </div>
          </div>
          <button
            className="btn ghost icon"
            onClick={() => session.setAssistantOpen(false)}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </header>

        <StatusLine status={status} />

        <div className="assistant-body">
          <NextStepSection onHardFailure={onHardFailure} />
          {ctx.commandSink ? <CommandSection sink={ctx.commandSink} /> : null}
          {ctx.actions.length ? (
            <section className="assistant-section" data-assistant="page-actions">
              <h3 className="assistant-h">{t('assist.onThisPage')}</h3>
              <div className="stack" style={{ gap: 6 }}>
                {ctx.actions.map((a) => (
                  <button
                    key={a.id}
                    className="btn block"
                    data-assistant-action={a.id}
                    onClick={() => { a.run(); if (a.closes !== false) session.setAssistantOpen(false); }}
                  >
                    <span className="assistant-action-label">{t(a.labelKey)}</span>
                    <span className="card-note">{t(a.noteKey)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <HonestyNote />
        </div>

        {status === 'needs-key' || status === 'off' ? <KeyFooter status={status} /> : null}
      </div>
    </Sheet>
  );
}

/** One line that says, unambiguously, what is available right now. */
function StatusLine({ status }: { status: AssistantStatus }): JSX.Element {
  const { t } = useI18n();
  const tone = status === 'on' ? 'ok' : status === 'unavailable' ? 'warn' : '';
  return (
    <div className="assistant-status">
      <span className={`tag ${tone}`} data-assistant-status={status}>
        {t(`assist.status.${status}`)}
      </span>
      <span className="card-note">{t(`assist.status.${status}.note`)}</span>
    </div>
  );
}

/* ------------------------------------------------------- what to do next --- */

/**
 * The one piece of guidance that is useful from anywhere, so it is the first
 * thing in the panel on every page.
 *
 * The deterministic recommendation is computed before anything is asked, and
 * shown whichever way the request goes. A learner without a key gets a real
 * answer; a learner with one gets a real answer plus a note when the model
 * disagreed with the rules. Neither of them gets an empty panel.
 */
function NextStepSection({ onHardFailure }: { onHardFailure: (v: boolean) => void }): JSX.Element {
  const { t, lang } = useI18n();
  const state = useAppState((s) => s);
  const task = useJevTask<NextStepDecision>();
  const [asked, setAsked] = useState(false);

  const signals = learnerSignals(state);
  const candidates = eligibleActivities(signals, state.progress.lessonsDone);
  const ruleChoice = ruleBasedNextStep(signals, candidates);

  useEffect(() => {
    onHardFailure(task.phase === 'failed' && (task.error === 'auth' || task.error === 'network'));
  }, [task.phase, task.error, onHardFailure]);

  const ask = useCallback(() => {
    setAsked(true);
    if (!jevActive()) return;
    void task.run({ task: 'next-step', signals, candidates, language: lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, JSON.stringify(signals), candidates.join(',')]);

  const decision = task.decision;
  const chosen = decision?.activity ?? ruleChoice;
  const activity = ACTIVITIES.find((a) => a.id === chosen);
  const source = decision ? decision.source : 'deterministic';
  const disagreed = decision !== null && decision.deterministicChoice !== decision.activity;

  return (
    <section className="assistant-section" data-assistant="next">
      <h3 className="assistant-h">{t('assist.next.title')}</h3>
      {!asked ? (
        <>
          <p className="card-note assistant-p">{t('assist.next.intro')}</p>
          <button className="btn primary" data-jev="recommend" onClick={ask}>
            {t('assist.next.ask')}
          </button>
        </>
      ) : null}

      <div aria-live="polite">
        {asked && task.phase === 'thinking' ? <JevThinking /> : null}
        {asked && task.phase === 'failed' && task.error !== 'disabled' ? (
          <JevFailure code={task.error ?? 'server'} retryAfter={task.retryAfter} onRetry={ask} />
        ) : null}

        {asked && task.phase !== 'thinking' && activity ? (
          <div className="assistant-result">
            <JevBadge source={source} confidence={decision?.confidence} />
            <strong className="assistant-answer">{t(`jev.activity.${activity.id}`)}</strong>
            <p className="card-note assistant-p">{t(`jev.activity.${activity.id}.why`)}</p>
            <div className="row tight">
              <button
                className="btn primary"
                data-assistant="go"
                onClick={() => { go(activity.route); session.setAssistantOpen(false); }}
              >
                {t('jev.tutor.go')}
              </button>
              <button className="btn ghost small" onClick={ask}>{t('jev.tutor.again')}</button>
            </div>
            {disagreed && decision ? (
              <p className="card-note assistant-p">
                {t('jev.tutor.disagreement', {
                  rule: t(`jev.activity.${decision.deterministicChoice}`),
                })}
              </p>
            ) : null}
            <ExplainNextStep signals={signals} candidates={candidates} decision={decision} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The expanded view.
 *
 * Basic view above is a recommendation and a button. Everything that only an
 * interested learner wants - what the tutor was looking at, which activities
 * were even eligible, how the model spread its probability - is behind this.
 * That is progressive disclosure applied to an AI result: the answer is one
 * line, the reasoning is one click, and neither is hidden.
 */
function ExplainNextStep({ signals, candidates, decision }: {
  signals: ReturnType<typeof learnerSignals>;
  candidates: string[];
  decision: NextStepDecision | null;
}): JSX.Element {
  const { t } = useI18n();
  const probs = decision?.trace?.answers.activity;
  return (
    <details className="assistant-details">
      <summary className="card-note">{t('assist.next.explain')}</summary>
      <div className="assistant-explain">
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
              <td>{t('assist.next.eligible')}</td>
              <td className="num">{candidates.length}</td>
            </tr>
          </tbody>
        </table>
        {probs && probs.type === 'choice' ? (
          <div style={{ marginTop: 10 }}>
            <div className="card-note" style={{ marginBottom: 4 }}>{t('assist.next.spread')}</div>
            {Object.entries(probs.probabilities)
              .sort((a, b) => b[1] - a[1]).slice(0, 5)
              .map(([id, p]) => (
                <div key={id} className="prob-row">
                  <span className="prob-label">{t(`jev.activity.${id}`)}</span>
                  <span className="meter" style={{ flex: 1 }}>
                    <i style={{ width: `${Math.round(p * 100)}%` }} />
                  </span>
                  <bdi className="mono-ltr prob-num">{Math.round(p * 100)}%</bdi>
                </div>
              ))}
          </div>
        ) : null}
        <p className="card-note assistant-p" style={{ marginTop: 10, marginBottom: 0 }}>
          <T k="assist.next.proofNote" />
        </p>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------- commands --- */

/**
 * "Scramble it", "go back one", "نمایش نقشه".
 *
 * The list of things it can do is fixed and every one of them is a button that
 * already exists elsewhere in the page. Nothing here invents a move, and an
 * instruction that is not clearly one of them is not carried out: it is
 * offered, with a button, for the learner to confirm. An AI judgment is
 * allowed to save a click; it is not allowed to turn the cube on a guess.
 */
function CommandSection({ sink }: { sink: (a: CommandAction) => void }): JSX.Element {
  const { t, lang } = useI18n();
  const task = useJevTask<CommandDecision>();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<CommandAction | null>(null);
  const [ruled, setRuled] = useState<CommandAction | null>(null);
  const input = useRef<HTMLInputElement>(null);

  /**
   * Carry out a keyword match, or offer it.
   *
   * The rule is the same whether the model was off or the call failed: a
   * keyword match may navigate on its own, and may not turn the cube on its
   * own. Only a model judgment that cleared both of its thresholds is allowed
   * to change the position without being asked twice, and a failure is not a
   * judgment. Navigation is free to undo by pressing Back; a scramble the
   * learner did not mean to ask for costs them the position they were on.
   */
  const applyFallback = (fallback: CommandAction): void => {
    if (fallback === 'none') return;
    if (MUTATING_ACTIONS.includes(fallback)) { setPending(fallback); return; }
    sink(fallback);
    setText('');
  };

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const utterance = text.trim();
    if (!utterance) return;
    setPending(null);
    const fallback = ruleBasedCommand(utterance, lang);
    setRuled(fallback);

    if (!jevActive()) { applyFallback(fallback); return; }

    const decision = await task.run({ task: 'command', utterance, language: lang });
    if (!decision) { applyFallback(fallback); return; }
    if (decision.action === 'none') return;
    if (decision.needsConfirmation) { setPending(decision.action); return; }
    sink(decision.action);
    setText('');
  };

  const decided = task.decision;
  const failed = task.phase === 'failed' && task.error !== 'disabled';

  return (
    <section className="assistant-section" data-assistant="command">
      <h3 className="assistant-h">{t('assist.command.title')}</h3>
      <form onSubmit={submit} className="assistant-command">
        <input
          ref={input}
          type="text"
          data-jev="command-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('assist.command.placeholder')}
          aria-label={t('assist.command.title')}
          maxLength={300}
        />
        <button className="btn" type="submit" data-jev="command" disabled={!text.trim()}>
          {t('assist.command.run')}
        </button>
      </form>
      <p className="card-note assistant-p">{t('assist.command.note')}</p>

      <div aria-live="polite">
        {task.phase === 'thinking' ? <JevThinking /> : null}
        {failed ? <JevFailure code={task.error ?? 'server'} /> : null}
        {ruled !== null && ruled !== 'none' && (failed || !task.available) ? (
          <p className="card-note assistant-p" data-assistant="used-rules">
            {t('assist.command.usedRules')}
          </p>
        ) : null}

        {pending ? (
          <div className="callout warn assistant-confirm">
            <p style={{ marginBottom: 8 }}>
              {t('assist.command.confirm', { action: t(`jev.action.${pending}`) })}
            </p>
            <div className="row tight">
              <button
                className="btn primary small"
                data-assistant="confirm"
                onClick={() => { sink(pending); setPending(null); setText(''); }}
              >
                {t('assist.command.doIt')}
              </button>
              <button className="btn small" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : null}

        {!pending && decided && decided.action === 'none' ? (
          <p className="card-note assistant-p" data-assistant="no-match">
            {t('assist.command.noMatch')}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- notes --- */

/** What is judged and what is proved, in two lines, always available. */
function HonestyNote(): JSX.Element {
  const { t } = useI18n();
  return (
    <details className="assistant-details">
      <summary className="card-note">{t('assist.honesty.summary')}</summary>
      <div className="assistant-explain">
        <p className="card-note assistant-p"><T k="assist.honesty.judged" /></p>
        <p className="card-note assistant-p" style={{ marginBottom: 0 }}>
          <T k="assist.honesty.proved" />
        </p>
      </div>
    </details>
  );
}

/**
 * The configuration entry point, where the learner already is.
 *
 * Small, at the bottom, and shown only when it would change something. It is
 * the one place in the application that accepts a key besides Settings, and it
 * hands it to the same store - held for this tab, never written to
 * `localStorage`, never put in a request body.
 */
function KeyFooter({ status }: { status: AssistantStatus }): JSX.Element {
  const { t } = useI18n();
  const [key, setKey] = useState('');
  const [open, setOpen] = useState(false);

  if (status === 'off') {
    return (
      <footer className="assistant-foot">
        <span className="card-note">{t('assist.foot.off')}</span>
        <button className="btn small" data-jev="on" onClick={() => jevConfig.setEnabled(true)}>
          {t('assist.foot.turnOn')}
        </button>
      </footer>
    );
  }

  return (
    <footer className="assistant-foot column">
      {!open ? (
        <>
          <span className="card-note">{t('assist.foot.noKey')}</span>
          <div className="row tight">
            <button className="btn small" data-assistant="add-key" onClick={() => setOpen(true)}>
              {t('assist.foot.addKey')}
            </button>
            <button
              className="btn small ghost"
              onClick={() => { go('#/settings'); session.setAssistantOpen(false); }}
            >
              {t('assist.foot.settings')}
            </button>
          </div>
        </>
      ) : (
        <form
          className="assistant-command"
          onSubmit={(e) => {
            e.preventDefault();
            if (!key.trim()) return;
            jevConfig.setSessionKey(key);
            jevConfig.setEnabled(true);
            setKey('');
            setOpen(false);
          }}
        >
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t('settings.keyPlaceholder')}
            aria-label={t('settings.keyPlaceholder')}
            autoComplete="off"
          />
          <button className="btn primary" type="submit" disabled={!key.trim()}>
            {t('assist.foot.use')}
          </button>
        </form>
      )}
      <span className="card-note">{t('assist.foot.keyNote')}</span>
    </footer>
  );
}

