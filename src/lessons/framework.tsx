import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Card, Callout } from '../components/ui';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import { formatSequence, parseSequence } from '../cube/notation';
import { actions, useAppState } from '../state/store';

/* ---------------------------------------------------------------- quiz --- */

export function Quiz({ id, question, options, correct, explain }: {
  id: string; question: ReactNode; options: string[]; correct: number; explain: ReactNode;
}): JSX.Element {
  const done = useAppState((s) => s.progress.exercisesDone.includes(id));
  const [picked, setPicked] = useState<number | null>(null);
  const revealed = picked !== null;

  return (
    <Card title="Check yourself" className="stack">
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
        <Callout kind={picked === correct ? 'info' : 'warn'} title={picked === correct ? 'Correct' : 'Not quite'}>
          {explain}
        </Callout>
      ) : null}
      {done && !revealed ? <span className="tag ok">already answered</span> : null}
    </Card>
  );
}

export function NumberQuiz({ id, question, answer, unit, explain }: {
  id: string; question: ReactNode; answer: number | bigint; unit?: string; explain: ReactNode;
}): JSX.Element {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  // Compare as digit strings: several of these answers are far past the
  // largest integer a double can hold exactly.
  const ok = value.replace(/[\s,_]/g, '') === answer.toString();

  return (
    <Card title="Check yourself" className="stack">
      <div style={{ marginBottom: 10 }}>{question}</div>
      <div className="row">
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setChecked(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { setChecked(true); if (ok) actions.markExercise(id); } }}
          placeholder="your answer"
          style={{ maxWidth: 220 }}
        />
        {unit ? <span className="card-note">{unit}</span> : null}
        <button className="btn" onClick={() => { setChecked(true); if (ok) actions.markExercise(id); }}>Check</button>
      </div>
      {checked ? (
        <Callout kind={ok ? 'info' : 'warn'} title={ok ? 'Correct' : `Not quite — the answer is ${answer.toLocaleString('en-US')}`}>
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
  check: (cube: CubieCube, movesUsed: number[]) => string | null;
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
    <Card title={title} note={parMoves ? `par: ${parMoves} moves` : undefined} className="stack">
      <div>{brief}</div>
      <div className="split" style={{ gap: 14 }}>
        <div>
          <Cube3D facelets={faceletString(toFacelets(cube))} interactive={false} height={260} />
        </div>
        <div className="stack">
          <MovePad onMove={(m) => setMoves((x) => [...x, m])} keyboard={false} />
          <div className="row tight">
            <button className="btn small" onClick={() => setMoves((x) => x.slice(0, -1))} disabled={!moves.length}>Undo</button>
            <button className="btn small ghost" onClick={() => { setMoves([]); setShowSolution(false); }}>Reset</button>
            {hint ? <button className="btn small ghost" onClick={() => setShowHint(true)} disabled={showHint}>Hint</button> : null}
            {solution ? <button className="btn small ghost" onClick={() => setShowSolution(true)} disabled={showSolution}>Show answer</button> : null}
          </div>
          <div className="card-note">
            {moves.length} move{moves.length === 1 ? '' : 's'}: <code>{formatSequence(moves) || '—'}</code>
          </div>
          {solvedTask ? (
            <Callout title={parMoves && moves.length <= parMoves ? 'Done, and within par' : 'Done'}>
              <p style={{ margin: 0 }}>
                {parMoves && moves.length > parMoves
                  ? `That works, in ${moves.length} moves. Par is ${parMoves} — try again and see if you can find the shorter route.`
                  : 'Exactly right.'}
              </p>
            </Callout>
          ) : moves.length > 0 ? (
            <div className="card-note">{failure}</div>
          ) : null}
          {showHint && hint ? <Callout kind="warn" title="Hint">{hint}</Callout> : null}
          {showSolution && solution ? (
            <Callout title="One answer"><p style={{ margin: 0 }}><code>{solution}</code></p></Callout>
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
  const moves = useMemo(() => parseSequence(sequence).moves, [sequence]);
  return (
    <span className="row tight" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
      <code>{sequence}</code>
      <button
        className="btn small ghost"
        onClick={() => actions.applyMoves(moves)}
        title="apply this to the cube in the Cube lab"
      >
        {label ?? 'try it'}
      </button>
    </span>
  );
}
