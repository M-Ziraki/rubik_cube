import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { Callout, Card, Sequence, Segmented, Stat, formatNodes } from '../components/ui';
import { SolutionReport } from './LabPage';
import { actions, currentFacelets, isSolved, useAppState } from '../state/store';
import { requestScramble, requestStats, solve, solveOptimally } from '../solver/client';
import type { TableStats } from '../solver/protocol';
import type { Solution } from '../solver/twophase';
import { METRIC_NOTES, NOTABLE_POSITIONS } from '../data/facts';
import { parseSequence } from '../cube/notation';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';

type Engine = 'two-phase' | 'optimal';

export function SolverPage(): JSX.Element {
  const state = useAppState((s) => s);
  const facelets = useMemo(() => currentFacelets(state), [state.origin, state.cursor, state.moves]);
  const solved = useMemo(() => isSolved(state), [facelets]);
  const [engine, setEngine] = useState<Engine>('two-phase');
  const [budget, setBudget] = useState(6);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Solution | null>(null);
  const [progress, setProgress] = useState<{ stage: string; fraction: number } | null>(null);
  const [proven, setProven] = useState<{ bound: number; nodes: number } | null>(null);
  const [stats, setStats] = useState<TableStats | null>(null);
  const token = useRef(0);

  useEffect(() => { setResult(null); setProven(null); }, [facelets, engine]);

  useEffect(() => {
    if (!state.tablesReady) return;
    requestStats().then(setStats).catch(() => undefined);
  }, [state.tablesReady]);

  const run = async (): Promise<void> => {
    const t = ++token.current;
    setRunning(true); setResult(null); setProven(null); setProgress(null);
    try {
      if (engine === 'two-phase') {
        const s = await solve(facelets, {
          timeBudgetMs: budget * 1000,
          maxLength: 20,
          onImprove: (partial) => { if (t === token.current) setResult(partial); },
        });
        if (t === token.current) setResult(s);
      } else {
        const s = await solveOptimally(facelets, {
          timeBudgetMs: budget * 1000,
          onProgress: (stage, fraction) => { if (t === token.current) setProgress({ stage, fraction }); },
          onDepth: (bound, nodes) => { if (t === token.current) setProven({ bound, nodes }); },
        });
        if (t === token.current) setResult(s);
      }
    } finally {
      if (t === token.current) { setRunning(false); setProgress(null); }
    }
  };

  const loadPosition = (scramble: string): void => {
    const moves = parseSequence(scramble).moves;
    actions.setPosition(faceletString(toFacelets(CubieCube.fromMoves(moves))), moves);
  };

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Laboratory</div>
        <h1>Solvers, and what they can honestly promise</h1>
        <p className="lede">
          Three different claims get muddled together constantly: <em>a</em> solution, a solution
          within twenty moves, and the <em>shortest</em> solution. They need completely different
          amounts of work, and only one of them can be proved by a web page. This laboratory keeps
          them apart.
        </p>
      </header>

      <div className="grid three" style={{ marginBottom: 20 }}>
        <Card title="Find any solution">
          <p style={{ marginBottom: 6 }}>Easy. Layer-by-layer methods do it with a handful of memorised algorithms, typically in 50–60 moves.</p>
          <span className="tag ok">milliseconds</span>
        </Card>
        <Card title="Find one within 20">
          <p style={{ marginBottom: 6 }}>Hard but tractable. Two-phase search finds them reliably — it just cannot certify that no shorter one exists.</p>
          <span className="tag warn">seconds</span>
        </Card>
        <Card title="Prove it is shortest">
          <p style={{ marginBottom: 6 }}>Brutal. Every shorter length must be exhaustively ruled out. Feasible here only for positions near home.</p>
          <span className="tag danger">seconds to never</span>
        </Card>
      </div>

      <div className="split">
        <div className="stack">
          <Card
            title="Position"
            note={solved ? 'solved' : 'scrambled'}
            actions={
              <div className="row tight">
                <button className="btn small" onClick={async () => {
                  const r = await requestScramble(25, true);
                  actions.setPosition(r.facelets, r.moves);
                }}>Random</button>
                <button className="btn small ghost" onClick={() => actions.resetToSolved()}>Reset</button>
              </div>
            }
          >
            <Cube3D />
          </Card>

          <Card title="Set up a known position">
            <div className="stack" style={{ gap: 8 }}>
              {NOTABLE_POSITIONS.slice(0, 4).map((p) => (
                <div key={p.name} className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.88rem' }}>{p.name}</span>
                  <button className="btn small" onClick={() => loadPosition(p.scramble)}>Load</button>
                </div>
              ))}
              <div className="row">
                <span className="card-note">Or nudge the solved cube a few moves to see the optimal search finish instantly.</span>
              </div>
              <div className="row tight">
                {[3, 5, 7, 9, 11].map((n) => (
                  <button key={n} className="btn small" onClick={async () => {
                    const r = await requestScramble(n, false);
                    actions.setPosition(r.facelets, r.moves);
                  }}>{n} turns</button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card
            title="Search"
            actions={
              <Segmented
                value={engine}
                onChange={(v) => setEngine(v)}
                options={[
                  { value: 'two-phase', label: 'Two-phase', title: 'Fast. Finds short solutions but cannot prove they are shortest.' },
                  { value: 'optimal', label: 'Provably optimal', title: 'Exhaustive. Proves the answer is shortest, when it can finish.' },
                ]}
              />
            }
          >
            <div className="stack">
              <label className="field">
                Time budget: {budget} second{budget === 1 ? '' : 's'}
                <input type="range" min={1} max={60} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
              </label>
              <div className="row">
                <button className="btn primary" onClick={run} disabled={running || solved || !state.tablesReady}>
                  {running ? 'Searching…' : engine === 'two-phase' ? 'Find a short solution' : 'Prove the shortest solution'}
                </button>
                {result?.moves.length ? (
                  <button className="btn" onClick={() => actions.queueMoves(result.moves)}>Queue on the cube</button>
                ) : null}
              </div>

              {progress ? (
                <div>
                  <div className="card-note" style={{ marginBottom: 4 }}>Building pattern databases · {progress.stage}</div>
                  <div className="meter"><i style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></div>
                </div>
              ) : null}

              {engine === 'optimal' && running && proven ? (
                <Callout title={`Ruled out every solution of ${proven.bound - 1} moves or fewer`}>
                  <p style={{ margin: 0 }}>
                    {proven.nodes.toLocaleString('en-US')} positions examined so far. Each completed
                    depth is a genuine proof, even if the search never finds the answer.
                  </p>
                </Callout>
              ) : null}

              {result ? (
                <OptimalReport result={result} engine={engine} />
              ) : running ? (
                <div className="shimmer" style={{ height: 70 }} />
              ) : (
                <p className="card-note" style={{ margin: 0 }}>
                  {engine === 'two-phase'
                    ? 'Two-phase search will keep improving its answer until the budget runs out.'
                    : 'The optimal search deepens one move at a time. Expect it to finish quickly up to about a dozen moves and to stall beyond that — that stall is the honest shape of the problem.'}
                </p>
              )}
            </div>
          </Card>

          <Card title="Metrics matter">
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th>metric</th><th>what counts as one move</th><th className="num">God's number</th></tr></thead>
                <tbody>
                  {METRIC_NOTES.map((m) => (
                    <tr key={m.name}>
                      <td><strong>{m.name}</strong><div className="card-note">{m.note}</div></td>
                      <td>{m.rule}</td>
                      <td className="num">{m.godsNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {stats ? <TableReport stats={stats} /> : null}
        </div>
      </div>
    </>
  );
}

function OptimalReport({ result, engine }: { result: Solution; engine: Engine }): JSX.Element {
  if (engine === 'two-phase') return <SolutionReport solution={result} />;
  if (result.length < 0) {
    return (
      <Callout kind="warn" title={`Proved: no solution of ${result.lowerBound - 1} moves or fewer`}>
        <p>
          The search exhausted its budget after examining {result.nodes.toLocaleString('en-US')} positions.
          That is not a failure — every depth it completed is a theorem. It simply could not reach
          the depth where the answer lives.
        </p>
        <p style={{ marginBottom: 0 }}>
          This is exactly the wall that made God's number hard. Proving the bound for <em>all</em> 43
          quintillion positions took a large distributed computation over about 35 CPU-years.
        </p>
      </Callout>
    );
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 14 }}>
        <Stat value={result.length} label="moves" sub="and no fewer" />
        <Stat value={formatNodes(result.nodes)} label="positions examined" sub={`${result.millis} ms`} />
      </div>
      <div className="row"><span className="tag ok">provably shortest</span></div>
      <Sequence moves={result.moves} />
      <p className="card-note" style={{ margin: 0 }}>
        Every length below {result.length} was searched to exhaustion and found empty. That is a
        proof, not an estimate.
      </p>
    </div>
  );
}

function TableReport({ stats }: { stats: TableStats }): JSX.Element {
  return (
    <Card title="What is in memory" note={`${(stats.coreBytes / 1048576).toFixed(1)} MB of lookup tables${stats.optimalBytes ? ` + ${(stats.optimalBytes / 1048576).toFixed(1)} MB of pattern databases` : ''}`}>
      <p className="card-note">
        Each row is a simplified version of the cube that has been solved <em>completely</em> by
        breadth-first search. The distances found there can never exceed the true distance, which
        is what lets the search discard branches safely.
      </p>
      <div className="scroll-x">
        <table className="data">
          <thead><tr><th>abstraction</th><th className="num">states</th><th className="num">diameter</th><th>distance spread</th></tr></thead>
          <tbody>
            {Object.entries(stats.histograms).map(([name, hist]) => {
              const total = hist.reduce((a, b) => a + b, 0);
              const max = Math.max(...hist);
              return (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="num">{total.toLocaleString('en-US')}</td>
                  <td className="num">{stats.diameters[name]}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 26 }}>
                      {hist.map((v, i) => (
                        <div
                          key={i}
                          title={`${v.toLocaleString('en-US')} states at distance ${i}`}
                          style={{
                            width: 7,
                            height: `${Math.max(2, (v / max) * 26)}px`,
                            background: 'var(--accent)',
                            opacity: 0.35 + 0.65 * (v / max),
                            borderRadius: 1,
                          }}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
