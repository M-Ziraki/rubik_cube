import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { Callout, Card, Sequence, Stat, formatNodes } from '../components/ui';
import { actions, currentFacelets, isSolved, getState, useAppState } from '../state/store';
import { requestScramble, solve } from '../solver/client';
import { formatSequence, invertSequence, parseSequence, simplifySequence } from '../cube/notation';
import { NOTABLE_POSITIONS } from '../data/facts';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import type { Solution } from '../solver/twophase';
import { GODS_NUMBER } from '../cube/defs';

export function LabPage(): JSX.Element {
  const state = useAppState((s) => s);
  const facelets = useMemo(() => currentFacelets(state), [state.origin, state.cursor, state.moves]);
  const solved = useMemo(() => isSolved(state), [facelets]);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [solving, setSolving] = useState(false);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const solveToken = useRef(0);

  useEffect(() => { setSolution(null); }, [facelets]);

  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => {
      const s = getState();
      if (s.cursor >= s.moves.length) { setPlaying(false); return; }
      actions.redo();
    }, Math.max(150, getState().turnSpeed + 70));
    return () => window.clearInterval(id);
  }, [playing]);

  const runSolve = async (): Promise<void> => {
    const token = ++solveToken.current;
    setSolving(true);
    setSolution(null);
    try {
      const s = await solve(facelets, {
        timeBudgetMs: 10000,
        maxLength: GODS_NUMBER,
        onImprove: (partial) => { if (token === solveToken.current) setSolution(partial); },
      });
      if (token === solveToken.current) setSolution(s);
    } finally {
      if (token === solveToken.current) setSolving(false);
    }
  };

  const applySequence = (text: string): void => {
    const parsed = parseSequence(text);
    if (parsed.errors.length) {
      setInputError(`Not valid notation: ${parsed.errors.map((e) => e.token).join(', ')}`);
      return;
    }
    setInputError(null);
    actions.applyMoves(parsed.moves);
    setInput('');
  };

  const loadPosition = (scramble: string): void => {
    const moves = parseSequence(scramble).moves;
    const cube = CubieCube.fromMoves(moves);
    actions.setPosition(faceletString(toFacelets(cube)), moves);
  };

  const simplified = useMemo(
    () => simplifySequence(state.moves.slice(0, state.cursor)),
    [state.moves, state.cursor],
  );

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Laboratory</div>
        <h1>Cube lab</h1>
        <p className="lede">
          A real 3×3×3 you can turn, scramble, analyse and solve. Every move is recorded, so you
          can step backwards and forwards through your own reasoning — and compare what you did
          with what a solver would have done.
        </p>
      </header>

      <div className="split">
        <div className="stack">
          <Card
            title={solved ? 'Solved' : 'Scrambled'}
            note={solved ? 'This is the centre of the graph.' : `${simplified.length} effective move${simplified.length === 1 ? '' : 's'} from the start position`}
            actions={
              <div className="row tight">
                <button className="btn small" onClick={async () => {
                  const r = await requestScramble(25, true);
                  actions.setPosition(r.facelets, r.moves);
                }}>Random position</button>
                <button className="btn small ghost" onClick={async () => {
                  const r = await requestScramble(25, false);
                  actions.setPosition(r.facelets, r.moves);
                }}>25 random turns</button>
              </div>
            }
          >
            <Cube3D />
          </Card>

          <Card title="Turn the cube">
            <MovePad onMove={(m) => actions.applyMove(m)} />
          </Card>
        </div>

        <div className="stack">
          <Card
            title="Move history"
            note={`${state.cursor} / ${state.moves.length}`}
            actions={
              <div className="row tight">
                <button className="btn small" onClick={() => actions.rewind()} title="back to the start">⏮</button>
                <button className="btn small" onClick={() => actions.undo()} disabled={state.cursor === 0}>Undo</button>
                <button className="btn small" onClick={() => actions.redo()} disabled={state.cursor >= state.moves.length}>Redo</button>
                <button className="btn small" onClick={() => setPlaying((p) => !p)} disabled={state.cursor >= state.moves.length}>
                  {playing ? 'Pause' : 'Play'}
                </button>
                <button className="btn small ghost" onClick={() => actions.clearMoves()}>Clear</button>
              </div>
            }
          >
            <Sequence moves={state.moves} cursor={state.cursor} onSeek={(i) => actions.seek(i)} empty="turn a face to begin" />
            {simplified.length !== state.cursor ? (
              <p className="card-note" style={{ marginTop: 10, marginBottom: 0 }}>
                Those {state.cursor} moves reduce to {simplified.length}: <code>{formatSequence(simplified) || 'nothing at all'}</code>.
                Cancellations like <code>R R&rsquo;</code> cost you nothing on the cube but everything in move count.
              </p>
            ) : null}
          </Card>

          <Card title="Enter a sequence">
            <div className="row">
              <input
                type="text"
                value={input}
                placeholder="e.g. R U R' U' or F2 L D' B2"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applySequence(input); }}
                style={{ flex: 1, minWidth: 180 }}
              />
              <button className="btn" onClick={() => applySequence(input)}>Apply</button>
              <button className="btn ghost" onClick={() => applySequence(formatSequence(invertSequence(parseSequence(input).moves)))}>
                Apply inverse
              </button>
            </div>
            {inputError ? <p className="card-note" style={{ color: 'var(--danger)', marginTop: 8, marginBottom: 0 }}>{inputError}</p> : null}
          </Card>

          <Card
            title="Solve it"
            note="Kociemba two-phase search, running in a background thread"
            actions={<button className="btn primary small" onClick={runSolve} disabled={solving || solved || !state.tablesReady}>
              {solving ? 'Searching…' : 'Find a solution'}
            </button>}
          >
            {solved ? (
              <p className="card-note" style={{ margin: 0 }}>Already solved — nothing to do.</p>
            ) : solution ? (
              <SolutionReport solution={solution} onApply={() => actions.queueMoves(solution.moves)} searching={solving} />
            ) : solving ? (
              <div className="shimmer" style={{ height: 64 }} />
            ) : (
              <p className="card-note" style={{ margin: 0 }}>
                The search looks for a route of at most {GODS_NUMBER} moves and keeps improving it
                until its time runs out.
              </p>
            )}
          </Card>

          <Card title="Famous positions">
            <div className="stack" style={{ gap: 10 }}>
              {NOTABLE_POSITIONS.map((p) => (
                <div key={p.name}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: '0.92rem' }}>{p.name}</strong>
                    <div className="row tight">
                      {p.distance ? <span className="tag">{p.distance} moves away</span> : null}
                      <button className="btn small" onClick={() => loadPosition(p.scramble)}>Load</button>
                    </div>
                  </div>
                  <div className="card-note">{p.note}</div>
                  <code style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>{p.scramble}</code>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export function SolutionReport({ solution, onApply, searching }: {
  solution: Solution; onApply?: () => void; searching?: boolean;
}): JSX.Element {
  if (solution.length < 0) {
    return (
      <Callout kind="warn" title="No solution found in the time available">
        <p style={{ margin: 0 }}>
          The search proved that nothing shorter than {solution.lowerBound} moves can work, but ran
          out of budget before finding a complete route. Try again with a longer budget.
        </p>
      </Callout>
    );
  }
  const claim = solution.guarantee === 'proven-optimal'
    ? { tag: 'ok', text: 'provably shortest' }
    : solution.length <= 20
      ? { tag: 'warn', text: 'within God’s number, not proven shortest' }
      : { tag: 'danger', text: 'a solution, but longer than God’s number' };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 14 }}>
        <Stat value={solution.length} label="moves" />
        <Stat value={solution.lowerBound} label="proven lower bound" sub="no shorter route can exist" />
        <Stat value={formatNodes(solution.nodes)} label="positions examined" sub={`${solution.millis} ms`} />
      </div>
      <div className="row">
        <span className={`tag ${claim.tag}`}>{claim.text}</span>
        {searching ? <span className="tag">still improving…</span> : null}
        {solution.timedOut && !searching ? <span className="tag warn">stopped on time</span> : null}
      </div>
      <Sequence moves={solution.moves} />
      {onApply ? (
        <div className="row">
          <button className="btn" onClick={onApply}>Queue these moves</button>
          <span className="card-note">then step through them with the history controls</span>
        </div>
      ) : null}
      {solution.guarantee !== 'proven-optimal' ? (
        <p className="card-note" style={{ margin: 0 }}>
          Two-phase search splits the problem in two and solves each half well. That is why it is
          fast, and exactly why it cannot promise the total is the smallest possible. The
          <a href="#/solver"> Solvers page</a> can try to prove optimality for positions close
          enough to solved.
        </p>
      ) : null}
    </div>
  );
}
