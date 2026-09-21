import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Card, Callout } from '../components/ui';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import { formatSequence, parseSequence } from '../cube/notation';
import { actions, useAppState } from '../state/store';
import { player } from '../state/player';
import { useI18n } from '../i18n/I18nProvider';

/* ---------------------------------------------------------------- quiz --- */

export function Quiz({ id, question, options, correct, explain }: {
  id: string; question: ReactNode; options: ReactNode[]; correct: number; explain: ReactNode;
}): JSX.Element {
  const { t } = useI18n();
  const done = useAppState((s) => s.progress.exercisesDone.includes(id));
  const [picked, setPicked] = useState<number | null>(null);
  const revealed = picked !== null;

  return (
    <Card title={t('course.checkYourself')} className="stack">
      <div style={{ marginBottom: 10 }}>{question}</div>
      <div className="stack" style={{ gap: 6 }}>
        {options.map((o, i) => {
          const isCorrect = i === correct;
          const chosen = picked === i;
          return (
            <button
              key={i}
              className="btn block"
              style={{
                borderColor: revealed && isCorrect ? 'var(--ok)' : chosen ? 'var(--danger)' : undefined,
                background: revealed && isCorrect ? 'var(--accent-soft)' : undefined,
              }}
              onClick={() => {
                setPicked(i);
                if (i === correct) actions.markExercise(id);
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
      {revealed ? (
        <Callout
          kind={picked === correct ? 'info' : 'warn'}
          title={picked === correct ? t('course.correct') : t('course.notQuite')}
        >
          {explain}
        </Callout>
      ) : null}
      {done && !revealed ? <span className="tag ok">{t('course.alreadyAnswered')}</span> : null}
    </Card>
  );
}

export function NumberQuiz({ id, question, answer, unit, explain }: {
  id: string; question: ReactNode; answer: number | bigint; unit?: string; explain: ReactNode;
}): JSX.Element {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  // Compare as digit strings: several of these answers are far past the
  // largest integer a double can hold exactly.
  const ok = value.replace(/[\s,_]/g, '') === answer.toString();

  return (
    <Card title={t('course.checkYourself')} className="stack">
      <div style={{ marginBottom: 10 }}>{question}</div>
      <div className="row">
        <input
          type="text"
          className="mono-ltr"
          value={value}
          onChange={(e) => { setValue(e.target.value); setChecked(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { setChecked(true); if (ok) actions.markExercise(id); } }}
          placeholder={t('course.yourAnswer')}
          style={{ maxWidth: 220 }}
        />
        {unit ? <span className="card-note">{unit}</span> : null}
        <button
          className="btn"
          onClick={() => { setChecked(true); if (ok) actions.markExercise(id); }}
        >
          {t('course.check')}
        </button>
      </div>
      {checked ? (
        <Callout
          kind={ok ? 'info' : 'warn'}
          title={ok
            ? t('course.correct')
            : t('course.notQuiteAnswer', { answer: answer.toLocaleString('en-US') })}
        >
          {explain}
        </Callout>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------- practical task --- */

export interface CubeTaskProps {
  id: string;
  title: string;
  brief: ReactNode;
  /** The position to start from, as a scramble applied to a solved cube. */
  setup: string;
  /** Returns null when the goal is met, or a short reason why it is not. */
  check: (cube: CubieCube, movesUsed: number[]) => ReactNode;
  /** Optional cap; exceeding it is allowed but reported. */
  parMoves?: number;
  hint?: ReactNode;
  solution?: string;
}

/**
 * A self-contained exercise with its own cube. It deliberately does not touch
 * the app-wide cube, so a lesson can never wreck a position you were working
 * on somewhere else.
 */
export function CubeTask({ id, title, brief, setup, check, parMoves, hint, solution }: CubeTaskProps): JSX.Element {
  const { t } = useI18n();
  const setupMoves = useMemo(() => parseSequence(setup).moves, [setup]);
  const [moves, setMoves] = useState<number[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  const cube = useMemo(() => {
    const c = CubieCube.fromMoves(setupMoves);
    c.applyMoves(moves);
    return c;
  }, [setupMoves, moves]);

  const failure = check(cube, moves);
  const solvedTask = failure === null;

  useEffect(() => { if (solvedTask && moves.length > 0) actions.markExercise(id); }, [solvedTask, id, moves.length]);

  return (
    <Card
      title={title}
      note={parMoves ? t('course.par', { n: parMoves }) : undefined}
      className="stack"
    >
      <div>{brief}</div>
      <div className="split" style={{ gap: 14 }}>
        <div>
          <Cube3D facelets={faceletString(toFacelets(cube))} interactive={false} height={260} />
        </div>
        <div className="stack">
          <MovePad onMove={(m) => setMoves((x) => [...x, m])} keyboard={false} />
          <div className="row tight">
            <button
              className="btn small"
              onClick={() => setMoves((x) => x.slice(0, -1))}
              disabled={!moves.length}
            >
              {t('common.undo')}
            </button>
            <button
              className="btn small ghost"
              onClick={() => { setMoves([]); setShowSolution(false); }}
            >
              {t('common.reset')}
            </button>
            {hint ? (
              <button className="btn small ghost" onClick={() => setShowHint(true)} disabled={showHint}>
                {t('common.hint')}
              </button>
            ) : null}
            {solution ? (
              <button
                className="btn small ghost"
                onClick={() => setShowSolution(true)}
                disabled={showSolution}
              >
                {t('common.showAnswer')}
              </button>
            ) : null}
          </div>
          <div className="card-note">
            {t('course.movesMade', { n: moves.length, seq: formatSequence(moves) || '—' })}
          </div>
          {solvedTask ? (
            <Callout title={parMoves && moves.length <= parMoves
              ? t('course.doneWithinPar')
              : t('course.done')}
            >
              <p style={{ margin: 0 }}>
                {parMoves && moves.length > parMoves
                  ? t('course.doneOverPar', { n: moves.length, par: parMoves })
                  : t('course.doneExact')}
              </p>
            </Callout>
          ) : moves.length > 0 ? (
            <div className="card-note">{failure}</div>
          ) : null}
          {showHint && hint ? <Callout kind="warn" title={t('common.hint')}>{hint}</Callout> : null}
          {showSolution && solution ? (
            <Callout title={t('course.oneAnswer')}>
              <p style={{ margin: 0 }}><bdi className="mono-ltr">{solution}</bdi></p>
            </Callout>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------- lesson chrome --- */

export function LessonBody({ children }: { children: ReactNode }): JSX.Element {
  return <div className="lesson stack" style={{ gap: 18 }}>{children}</div>;
}

export function TryOnTheCube({ sequence, label }: { sequence: string; label?: string }): JSX.Element {
  const { t } = useI18n();
  const moves = useMemo(() => parseSequence(sequence).moves, [sequence]);
  return (
    <span className="row tight" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
      <bdi className="mono-ltr">{sequence}</bdi>
      <button
        className="btn small ghost"
        onClick={() => { player.yieldToUser(); actions.applyMoves(moves); }}
        title={t('lab.turnTheCube')}
      >
        {label ?? t('course.tryIt')}
      </button>
    </span>
  );
}
