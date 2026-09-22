import { useMemo, useRef, useState } from 'react';
import { Callout, Card, Segmented, Stat } from '../components/ui';
import { JevBadge, JevFailure, JevThinking } from '../components/JevBadge';
import { T, useI18n } from '../i18n/I18nProvider';
import { usePublishAssistantContext } from '../jev/assistantContext';
import { go } from '../state/navigation';
import { useAppState } from '../state/store';
import { useJevConfig, jevActive } from '../jev/config';
import { askJev, JevError } from '../jev/client';
import { learnerSignals } from '../jev/signals';
import { eligibleActivities, ruleBasedCommand, ruleBasedNextStep } from '../jev/decisions';
import { ACTIVITIES, MISCONCEPTION_PROMPTS, THRESHOLDS } from '../jev/questions';
import { MISCONCEPTION_CASES, COMMAND_CASES, STUCK_CASES } from '../../evals/dataset';
import {
  MISCONCEPTION_LABELS, type MisconceptionDecision, type MisconceptionLabel,
  type NextStepDecision, type TracedAnswer,
} from '../jev/protocol';

type Tab = 'compare' | 'evaluate' | 'categories';

/**
 * The AI Learning Lab.
 *
 * Cube Atlas already draws a careful line between what is proved and what is
 * merely found; this page extends that line to the tutor itself. It runs the
 * same evaluation set the thresholds were calibrated on, in the learner's own
 * browser with their own key, and shows where the model agrees with the rules,
 * where it does not, and where it was too unsure to say.
 *
 * It is a teaching surface rather than a debugging one. The probabilities are
 * here because a probability is a genuinely interesting object to look at, not
 * because someone needs to inspect a payload - and the page says plainly that
 * a confident answer is still only an answer.
 */
export function LearningLabPage(): JSX.Element {
  // What the study panel offers from this page. The panel itself always
  // carries the universal help; these are the jumps that only make sense
  // from here.
  usePublishAssistantContext(() => ({ labelKey: 'nav.aiLab', actions: [
      { id: 'settings', labelKey: 'assist.act.settings', noteKey: 'assist.act.settings.note',
        run: () => go('#/settings') },
    ] }), []);

  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('compare');
  const config = useJevConfig();
  const active = jevActive(config);

  return (
    <div className="stack">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'compare', label: t('lab2.tab.compare') },
          { value: 'evaluate', label: t('lab2.tab.evaluate') },
          { value: 'categories', label: t('lab2.tab.categories') },
        ]}
      />

      {!active ? (
        <Callout title={t('lab2.offTitle')}>
          <p style={{ marginBottom: 8 }}>{t('lab2.offBody')}</p>
          <a className="btn small" href="#/settings">{t('lab2.openSettings')}</a>
        </Callout>
      ) : null}

      {tab === 'compare' ? <CompareView /> : tab === 'evaluate' ? <EvaluateView /> : <CategoriesView />}
    </div>
  );
}

/* ------------------------------------------- rules beside the model's pick --- */

function CompareView(): JSX.Element {
  const { t, lang } = useI18n();
  const state = useAppState((s) => s);
  const config = useJevConfig();
  const [decision, setDecision] = useState<NextStepDecision | null>(null);
  const [phase, setPhase] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const signals = useMemo(() => learnerSignals(state), [state.progress]);
  const candidates = useMemo(
    () => eligibleActivities(signals, state.progress.lessonsDone),
    [signals, state.progress.lessonsDone],
  );
  const rule = ruleBasedNextStep(signals, candidates);

  const run = async (): Promise<void> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase('busy'); setError(null);
    try {
      const d = await askJev(
        { task: 'next-step', signals, candidates, language: lang }, controller.signal,
      ) as NextStepDecision;
      setDecision(d); setPhase('idle');
    } catch (err) {
      if (err instanceof JevError && err.code === 'aborted') return;
      setError(err instanceof JevError ? err.code : 'server');
      setPhase('failed');
    }
  };

  const probabilities = decision?.trace?.answers.next;

  return (
    <div className="stack">
      <Card title={t('lab2.compare.title')} note={t('lab2.compare.note')} className="stack">
        <div className="row" style={{ gap: 18 }}>
          <Stat
            value={t(`jev.activity.${rule}`)}
            label={t('lab2.compare.rules')}
            sub={t('lab2.compare.rulesSub')}
          />
          <Stat
            value={decision ? t(`jev.activity.${decision.activity}`) : '—'}
            label={t('lab2.compare.jev')}
            sub={decision
              ? t('lab2.compare.jevSub', { n: Math.round((decision.confidence ?? 0) * 100) })
              : t('lab2.compare.notRun')}
          />
        </div>

        <div className="row">
          <button
            className="btn primary"
            data-lab="compare"
            onClick={() => void run()}
            disabled={!jevActive(config) || phase === 'busy'}
          >
            {t('lab2.compare.run')}
          </button>
          {decision ? <JevBadge source={decision.source} confidence={decision.confidence} /> : null}
        </div>

        {phase === 'busy' ? <JevThinking /> : null}
        {phase === 'failed' ? <JevFailure code={error ?? 'server'} onRetry={() => void run()} /> : null}

        {decision ? (
          <p className="card-note" style={{ margin: 0 }}>
            {decision.activity === decision.deterministicChoice
              ? t('lab2.compare.agree')
              : t('lab2.compare.differ', {
                rule: t(`jev.activity.${decision.deterministicChoice}`),
                jev: t(`jev.activity.${decision.activity}`),
              })}
          </p>
        ) : null}

        {probabilities && probabilities.type === 'choice' ? (
          <Distribution probabilities={probabilities.probabilities} nameKey="jev.activity" />
        ) : null}
      </Card>

      <Card title={t('lab2.eligible')} className="stack">
        <p className="card-note" style={{ margin: 0 }}>{t('lab2.eligibleBody')}</p>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{t('lab2.activity')}</th>
                <th>{t('lab2.requires')}</th>
                <th>{t('lab2.offered')}</th>
              </tr>
            </thead>
            <tbody>
              {ACTIVITIES.map((a) => (
                <tr key={a.id}>
                  <td>{t(`jev.activity.${a.id}`)}</td>
                  <td>{a.requires.length
                    ? a.requires.map((r) => t(`lesson.${r}.title`)).join(' · ')
                    : t('common.none')}</td>
                  <td>
                    {candidates.includes(a.id)
                      ? <span className="tag ok">{t('lab2.yes')}</span>
                      : <span className="tag">{t('lab2.no')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------------------- run the evaluation dataset --- */

interface EvalRow {
  id: string;
  language: string;
  expected: MisconceptionLabel;
  got: MisconceptionLabel | null;
  confidence: number | null;
  source: string;
  corrected?: MisconceptionLabel;
}

function EvaluateView(): JSX.Element {
  const { t } = useI18n();
  const config = useJevConfig();
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyLang, setOnlyLang] = useState<'all' | 'en' | 'fa'>('all');
  const abort = useRef<AbortController | null>(null);

  const cases = MISCONCEPTION_CASES.filter((c) => onlyLang === 'all' || c.language === onlyLang);

  const run = async (): Promise<void> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true); setError(null); setRows([]);
    try {
      for (const c of cases) {
        const d = await askJev({
          task: 'misconception', promptId: c.promptId, answer: c.answer, language: c.language,
        }, controller.signal) as MisconceptionDecision;
        if (controller.signal.aborted) return;
        setRows((prev) => [...prev, {
          id: c.id,
          language: c.language,
          expected: c.expected,
          got: d.label,
          confidence: d.confidence ?? null,
          source: d.source,
        }]);
      }
    } catch (err) {
      if (err instanceof JevError && err.code === 'aborted') return;
      setError(err instanceof JevError ? err.code : 'server');
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  };

  const scored = rows.filter((r) => r.got !== null);
  const exact = scored.filter((r) => (r.corrected ?? r.got) === r.expected).length;
  const abstained = rows.filter((r) => r.source === 'jev-uncertain').length;

  return (
    <div className="stack">
      <Card title={t('lab2.eval.title')} note={t('lab2.eval.note')} className="stack">
        <p className="card-note" style={{ margin: 0 }}>{t('lab2.eval.body')}</p>

        <div className="row">
          <Segmented
            value={onlyLang}
            onChange={setOnlyLang}
            options={[
              { value: 'all', label: t('lab2.eval.all') },
              { value: 'en', label: 'English' },
              { value: 'fa', label: 'فارسی' },
            ]}
          />
          <button
            className="btn primary"
            data-lab="evaluate"
            onClick={() => void run()}
            disabled={!jevActive(config) || running}
          >
            {running ? t('lab2.eval.running', { n: rows.length, total: cases.length }) : t('lab2.eval.run')}
          </button>
          {running ? (
            <button className="btn ghost" onClick={() => { abort.current?.abort(); setRunning(false); }}>
              {t('lab2.eval.stop')}
            </button>
          ) : null}
        </div>

        {error ? <JevFailure code={error} /> : null}

        {scored.length ? (
          <div className="row" style={{ gap: 18 }}>
            <Stat value={`${exact}/${scored.length}`} label={t('lab2.eval.exact')} />
            <Stat value={abstained} label={t('lab2.eval.abstained')} sub={t('lab2.eval.abstainedSub')} />
            <Stat
              value={`${Math.round(THRESHOLDS.misconceptionConfidence * 100)}%`}
              label={t('lab2.eval.threshold')}
              sub={t('lab2.eval.thresholdSub')}
            />
          </div>
        ) : null}

        {rows.length ? (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('lab2.eval.case')}</th>
                  <th>{t('lab2.eval.expected')}</th>
                  <th>{t('lab2.eval.got')}</th>
                  <th className="num">{t('lab2.eval.confidence')}</th>
                  <th>{t('lab2.eval.yourVerdict')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const effective = r.corrected ?? r.got;
                  const ok = effective === r.expected;
                  return (
                    <tr key={r.id}>
                      <td>
                        <bdi className="mono-ltr">{r.id}</bdi>
                        <div className="card-note">
                          {MISCONCEPTION_CASES.find((c) => c.id === r.id)?.note}
                        </div>
                      </td>
                      <td>{t(`jev.label.${r.expected}`)}</td>
                      <td>
                        {r.got ? t(`jev.label.${r.got}`) : '—'}
                        {' '}
                        {ok ? <span className="tag ok">✓</span> : <span className="tag warn">≠</span>}
                      </td>
                      <td className="num">
                        {r.confidence === null ? '—' : `${Math.round(r.confidence * 100)}%`}
                      </td>
                      <td>
                        <select
                          value={effective ?? ''}
                          aria-label={t('lab2.eval.yourVerdict')}
                          onChange={(e) => setRows((prev) => prev.map((row, j) =>
                            (j === i ? { ...row, corrected: e.target.value as MisconceptionLabel } : row)))}
                        >
                          {MISCONCEPTION_LABELS.map((l) => (
                            <option key={l} value={l}>{t(`jev.label.${l}`)}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="card-note" style={{ margin: 0 }}>{t('lab2.eval.disclaimer')}</p>
      </Card>
    </div>
  );
}

/* --------------------------------------------------- the categories page --- */

function CategoriesView(): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="stack">
      <Card title={t('lab2.cat.title')} className="stack">
        <p className="card-note" style={{ margin: 0 }}>{t('lab2.cat.body')}</p>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{t('lab2.cat.label')}</th>
                <th>{t('lab2.cat.meaning')}</th>
                <th>{t('lab2.cat.action')}</th>
              </tr>
            </thead>
            <tbody>
              {MISCONCEPTION_LABELS.map((l) => (
                <tr key={l}>
                  <td><strong>{t(`jev.label.${l}`)}</strong></td>
                  <td><T k={`jev.label.${l}.meaning`} /></td>
                  <td><T k={`jev.remedy.${l}.action`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('lab2.cat.prompts')} className="stack">
        <p className="card-note" style={{ margin: 0 }}>{t('lab2.cat.promptsBody')}</p>
        {MISCONCEPTION_PROMPTS.map((p) => (
          <div key={p.id}>
            <strong><T k={`jev.prompt.${p.id}`} /></strong>
            <div className="row tight" style={{ marginTop: 4 }}>
              {p.plausible.map((l) => <span key={l} className="tag">{t(`jev.label.${l}`)}</span>)}
            </div>
          </div>
        ))}
      </Card>

      <Card title={t('lab2.cat.division')}>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{t('lab2.cat.question')}</th>
                <th>{t('lab2.cat.decidedBy')}</th>
              </tr>
            </thead>
            <tbody>
              {['permutation', 'reachable', 'shortest', 'godsNumber', 'moveCount', 'score',
                'diagnosis', 'nextStep', 'hintLevel', 'intent'].map((k) => (
                  <tr key={k}>
                    <td>{t(`lab2.division.${k}`)}</td>
                    <td>
                      <span className={`tag ${k === 'diagnosis' || k === 'nextStep' || k === 'hintLevel' || k === 'intent' ? 'warn' : 'ok'}`}>
                        {t(`lab2.division.${k}.by`)}
                      </span>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-note" style={{ marginTop: 10, marginBottom: 0 }}>
          {t('lab2.cat.divisionNote')}
        </p>
      </Card>

      <Card title={t('lab2.cat.commands')}>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr><th>{t('lab2.eval.case')}</th><th>{t('lab2.eval.expected')}</th></tr>
            </thead>
            <tbody>
              {COMMAND_CASES.map((c) => (
                <tr key={c.id}>
                  <td>
                    <bdi>{c.utterance}</bdi>
                    <div className="card-note">{c.note}</div>
                  </td>
                  <td>
                    {t(`jev.action.${c.expected}`)}
                    <div className="card-note">
                      {t('lab2.cat.keywordSays', {
                        action: t(`jev.action.${ruleBasedCommand(c.utterance, c.language)}`),
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/*
        The hardest cases in the set, and the ones most worth showing: three of
        them have "do not route this" as the right answer, which is the part of
        the design a reader is most likely to doubt.
      */}
      <Card title={t('lab2.cat.stuck')} note={t('lab2.cat.stuckNote')}>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr><th>{t('lab2.eval.case')}</th><th>{t('lab2.eval.expected')}</th></tr>
            </thead>
            <tbody>
              {STUCK_CASES.map((c) => (
                <tr key={c.id}>
                  <td>
                    <bdi>{c.description}</bdi>
                    <div className="card-note">{c.note}</div>
                  </td>
                  <td>
                    {c.expected === 'none'
                      ? t(`lab2.cat.outcome.${c.outcome ?? 'route'}`)
                      : t(`jev.activity.${c.expected}`)}
                    <div className="card-note">{t(`lab2.cat.lang.${c.language}`)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** A probability distribution, drawn as bars. */
function Distribution({ probabilities, nameKey }: {
  probabilities: Record<string, number>; nameKey: string;
}): JSX.Element {
  const { t } = useI18n();
  const entries = Object.entries(probabilities).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(...entries.map(([, v]) => v), 0.0001);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="card-note">{t('lab2.distribution')}</div>
      {entries.map(([label, p]) => (
        <div key={label} className="row tight" style={{ gap: 8 }}>
          <span style={{ minWidth: 160, fontSize: '0.82rem' }}>{t(`${nameKey}.${label}`)}</span>
          <div className="meter" style={{ flex: 1 }}>
            <i style={{ width: `${(p / max) * 100}%` }} />
          </div>
          <bdi className="mono-ltr" style={{ minWidth: 48, textAlign: 'end', fontSize: '0.78rem' }}>
            {(p * 100).toFixed(1)}%
          </bdi>
        </div>
      ))}
    </div>
  );
}

export type { TracedAnswer };
