/**
 * "Make me one."
 *
 * The clearest division of labour in the application, and the reason this
 * feature is worth having rather than a fifth panel: the model chooses the
 * shape of the exercise - how hard, and what kind of hard - and the cube
 * engine builds a position to that shape and proves it. Every number the
 * learner is then graded against is a proof, not a judgment.
 *
 * With no key it still works: the rules pick the difficulty from the record,
 * the generator does the same work, and the badge says the choice was
 * computed. That is the whole application's contract, applied here too.
 */

import { useCallback, useRef, useState } from 'react';
import { Callout } from './ui';
import { JevBadge, JevFailure, JevThinking } from './JevBadge';
import { useI18n } from '../i18n/I18nProvider';
import { useAppState } from '../state/store';
import { useJevTask } from '../jev/useJevTask';
import { jevActive } from '../jev/config';
import { learnerSignals } from '../jev/signals';
import { EXERCISE_BANDS, ruleBasedBand } from '../jev/decisions';
import { generateExercise, type GeneratedExercise } from '../jev/exercise';
import type { DecisionSource, ExerciseDecision, ExerciseFocus } from '../jev/protocol';

export interface ExerciseMakerProps {
  /** Hands the page a verified position to start a graded attempt on. */
  onReady: (exercise: GeneratedExercise) => void;
  disabled?: boolean;
}

type Phase = 'idle' | 'asking' | 'building' | 'done' | 'failed';

export function ExerciseMaker({ onReady, disabled = false }: ExerciseMakerProps): JSX.Element {
  const { t, lang } = useI18n();
  const state = useAppState((s) => s);
  const task = useJevTask<ExerciseDecision>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [shape, setShape] = useState<{
    distance: number; focus: ExerciseFocus; source: DecisionSource;
    confidence?: number; legend?: string; ruleDistance: number;
  } | null>(null);
  const [built, setBuilt] = useState<GeneratedExercise | null>(null);
  const run = useRef(0);

  const signals = learnerSignals(state);
  const bands = [...EXERCISE_BANDS];

  const make = useCallback(async (): Promise<void> => {
    const token = ++run.current;
    setBuilt(null);
    const ruleDistance = ruleBasedBand(signals, bands);

    // Always computed, and used as-is when there is nothing to ask.
    let chosen = {
      distance: ruleDistance,
      focus: 'mixed' as ExerciseFocus,
      source: 'deterministic' as DecisionSource,
      confidence: undefined as number | undefined,
      legend: undefined as string | undefined,
      ruleDistance,
    };

    if (jevActive()) {
      setPhase('asking');
      const decision = await task.run({ task: 'exercise', signals, bands, language: lang });
      if (token !== run.current) return;
      if (decision) {
        chosen = {
          distance: decision.distance,
          focus: decision.focus,
          source: decision.source,
          confidence: decision.confidence,
          legend: decision.bandLegend,
          ruleDistance: decision.deterministicDistance,
        };
      }
      // A failure is not fatal: the rules already chose a difficulty.
    }
    setShape(chosen);

    setPhase('building');
    const exercise = await generateExercise(chosen.distance, chosen.focus).catch(() => null);
    if (token !== run.current) return;
    if (!exercise) { setPhase('failed'); return; }
    setBuilt(exercise);
    setPhase('done');
    onReady(exercise);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, JSON.stringify(signals), onReady]);

  const busy = phase === 'asking' || phase === 'building';

  return (
    <div className="stack" style={{ gap: 8 }}>
      <button
        className="btn primary"
        data-exercise="make"
        disabled={disabled || busy}
        onClick={() => { void make(); }}
      >
        {busy ? t('exercise.making') : t('exercise.make')}
      </button>
      <p className="card-note" style={{ margin: 0 }}>{t('exercise.note')}</p>

      <div aria-live="polite">
        {phase === 'asking' ? <JevThinking /> : null}
        {phase === 'building' ? (
          <div className="row tight">
            <span className="jev-pulse" aria-hidden="true" />
            <span className="card-note">{t('exercise.building')}</span>
          </div>
        ) : null}

        {task.phase === 'failed' && task.error !== 'disabled' && phase !== 'idle' ? (
          <JevFailure code={task.error ?? 'server'} retryAfter={task.retryAfter} />
        ) : null}

        {phase === 'failed' ? (
          <Callout kind="warn" title={t('exercise.failedTitle')}>
            <p style={{ margin: 0 }}>{t('exercise.failedBody')}</p>
          </Callout>
        ) : null}

        {phase === 'done' && shape && built ? (
          <div className="stack" style={{ gap: 6 }} data-exercise="result">
            <div className="row tight">
              <JevBadge source={shape.source} confidence={shape.confidence} />
              {/* The distance is the engine's, whoever chose it, so it is
                  labelled as proved rather than judged. */}
              <span className="tag ok">
                {t('exercise.proved', { n: built.distance })}
              </span>
            </div>
            <p style={{ margin: 0 }}>
              {t(`exercise.focus.${built.focus}`)}
              {!built.focusMet ? ` — ${t('exercise.focusMissed')}` : ''}
            </p>
            {shape.legend ? (
              <p className="card-note" style={{ margin: 0 }}><em>{shape.legend}</em></p>
            ) : null}
            {shape.source !== 'deterministic' && shape.ruleDistance !== shape.distance ? (
              <p className="card-note" style={{ margin: 0 }}>
                {t('exercise.disagreement', { n: shape.ruleDistance })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
