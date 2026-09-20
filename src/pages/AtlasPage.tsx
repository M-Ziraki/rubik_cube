import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { GraphCanvas } from '../graph/GraphCanvas';
import { ShellCanvas } from '../graph/ShellCanvas';
import { Callout, Card, Sequence, Stat, formatBig } from '../components/ui';
import { actions, currentFacelets, isSolved, useAppState, getState } from '../state/store';
import { requestNeighbourhood, requestScramble } from '../solver/client';
import type { GraphPayload } from '../solver/protocol';
import { HTM_DISTANCE_DISTRIBUTION, TOTAL_STATES } from '../data/facts';
import { MOVE_NAMES } from '../cube/defs';

export function AtlasPage(): JSX.Element {
  const state = useAppState((s) => s);
  const facelets = useMemo(() => currentFacelets(state), [state.origin, state.cursor, state.moves]);
  const solved = useMemo(() => isSolved(state), [facelets]);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [depth, setDepth] = useState(2);
  const [loading, setLoading] = useState(false);
  const [shellFocus, setShellFocus] = useState<number | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!state.tablesReady) return;
    const token = ++reqRef.current;
    setLoading(true);
    requestNeighbourhood(facelets, depth, depth >= 3 ? 3500 : 900)
      .then((g) => { if (token === reqRef.current) setGraph(g); })
      .finally(() => { if (token === reqRef.current) setLoading(false); });
  }, [facelets, depth, state.tablesReady]);

  const shells = useMemo(
    () => HTM_DISTANCE_DISTRIBUTION.map((r) => ({
      distance: r.distance,
      count: r.count,
      exact: r.exact,
      sample: r.distance === 0 ? 1 : Math.max(3, Math.round(Math.log10(Math.max(10, r.count)) * 7)),
    })),
    [],
  );

  const scramble = async (): Promise<void> => {
    const r = await requestScramble(25, false);
    actions.setPosition(r.facelets, r.moves);
  };

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">The idea, made interactive</div>
        <h1>A cube is a graph. Solving it is a walk.</h1>
        <p className="lede">
          Every arrangement of the cube is a vertex. Every legal turn is an edge joining two of
          them. Scrambling walks you away from the middle; solving is finding a way back. The
          whole of this application is built on that one sentence — and on the fact that the walk
          home is never longer than twenty steps.
        </p>
      </header>

      <div className="split" style={{ marginBottom: 20 }}>
        <Card
          title="The position"
          note={solved ? 'Solved — you are standing at the centre of the graph.' : `${state.cursor} move${state.cursor === 1 ? '' : 's'} from where you started.`}
          actions={
            <div className="row tight">
              <button className="btn small" onClick={scramble}>Scramble</button>
              <button className="btn small ghost" onClick={() => actions.resetToSolved()}>Solve instantly</button>
            </div>
          }
        >
          <Cube3D />
          <div style={{ marginTop: 12 }}>
            <div className="card-note" style={{ marginBottom: 4 }}>Scramble</div>
            <Sequence moves={state.scrambleMoves} empty="cube is solved" />
          </div>
          <p className="card-note" style={{ marginTop: 12, marginBottom: 0 }}>
            Drag a layer to turn it. Drag the background to look around. Every turn you make
            moves the dark dot in the middle of the map beside this.
          </p>
        </Card>

        <Card
          title="The neighbourhood"
          note={
            graph
              ? `${graph.nodes.length} positions within ${depth} move${depth === 1 ? '' : 's'} of this one`
              : 'building…'
          }
          actions={
            <div className="seg">
              {[1, 2, 3].map((d) => (
                <button key={d} aria-pressed={depth === d} onClick={() => setDepth(d)}>{d}</button>
              ))}
            </div>
          }
        >
          {loading && !graph ? (
            <div className="shimmer" style={{ height: 380 }} />
          ) : (
            <GraphCanvas
              graph={graph}
              height={380}
              onSelect={(node) => {
                // Walk to the clicked position by replaying the moves that lead to it.
                if (!graph) return;
                const chain: number[] = [];
                let cur = node.id;
                while (cur >= 0 && graph.nodes[cur].parent >= 0) {
                  chain.unshift(graph.nodes[cur].viaMove);
                  cur = graph.nodes[cur].parent;
                }
                actions.applyMoves(chain);
              }}
              caption="click a dot to travel there"
            />
          )}
          <p className="card-note" style={{ marginTop: 6, marginBottom: 0 }}>
            Rings are distance in moves. Dot colour is the face you would turn to get there.
            The faint strands crossing between rings are the reason this is a graph and not a
            tree: different sequences of turns land on the same position.
          </p>
        </Card>
      </div>

      <div className="grid three" style={{ marginBottom: 20 }}>
        <Card>
          <Stat
            value={<span style={{ fontSize: '1.05rem', lineHeight: 1.25, display: 'block' }}>{formatBig(TOTAL_STATES)}</span>}
            label="positions"
            sub="8! · 3⁷ · 12! · 2¹¹ ⁄ 2 — reachable arrangements of a 3×3×3 cube"
          />
        </Card>
        <Card>
          <Stat value="20" label="God's number" sub="Proved in 2010: no position needs more than twenty face turns. Also proved: some positions really do need all twenty." />
        </Card>
        <Card>
          <Stat value="18" label="edges per vertex" sub="Six faces × three turns. The graph is 18-regular, so it grows about thirteenfold per step once you discount backtracking." />
        </Card>
      </div>

      <div className="split" style={{ marginBottom: 20 }}>
        <Card title="Where the cube actually lives" note="published distance distribution, face-turn metric">
          <ShellCanvas
            spec={shells}
            height={400}
            highlight={shellFocus}
            onHighlight={setShellFocus}
            subtitle="Hover a ring. Counts to distance 15 are exact; beyond that they are the published estimates."
          />
        </Card>
        <div className="stack">
          <Callout title="The counter-intuitive part">
            <p>
              Almost every position sits <em>17 or 18 moves</em> from solved. Positions needing the
              full twenty are so rare that only a few hundred million of them are thought to exist —
              about one in a hundred billion. A random scramble is nowhere near the worst case, and
              yet it is still far beyond what any human method reaches.
            </p>
          </Callout>
          <Card title="Distances in numbers">
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr><th className="num">moves</th><th className="num">positions</th><th className="num">share</th><th>status</th></tr>
                </thead>
                <tbody>
                  {HTM_DISTANCE_DISTRIBUTION.filter((r) => r.distance >= 10).map((r) => (
                    <tr
                      key={r.distance}
                      style={shellFocus === r.distance ? { background: 'var(--accent-soft)' } : undefined}
                      onMouseEnter={() => setShellFocus(r.distance)}
                      onMouseLeave={() => setShellFocus(null)}
                    >
                      <td className="num">{r.distance}</td>
                      <td className="num">{r.exact ? r.count.toLocaleString('en-US') : `≈ ${r.count.toExponential(1)}`}</td>
                      <td className="num">{(100 * r.count / TOTAL_STATES).toFixed(r.count / TOTAL_STATES > 0.01 ? 1 : 6)}%</td>
                      <td>{r.exact ? <span className="tag ok">exact</span> : <span className="tag warn">estimate</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <Card title="What this application is for">
        <div className="prose">
          <p>
            Watching an animation is not the same as understanding it, and understanding it is not
            the same as being able to do it. This app is built around that gap.
          </p>
          <ul>
            <li>
              <strong>The <a href="#/course">Course</a></strong> walks from notation to group theory
              to search algorithms, with something to try at every step.
            </li>
            <li>
              <strong>The <a href="#/graph">State-space</a> laboratory</strong> lets you explore the
              graph directly — including the 2×2×2 cube, small enough that this page enumerates
              every one of its 3,674,160 positions and proves its God's number from scratch.
            </li>
            <li>
              <strong>The <a href="#/solver">Solvers</a></strong> run Kociemba's two-phase algorithm
              and a genuinely optimal search side by side, and are scrupulous about which one can
              prove what.
            </li>
            <li>
              <strong><a href="#/scan">Your cube</a></strong> takes the colours off the plastic cube
              on your desk, checks they are physically possible, and talks you through a solution.
            </li>
            <li>
              <strong><a href="#/training">Training</a></strong> grades your solutions against the
              true optimum and tracks how close you are getting.
            </li>
          </ul>
        </div>
      </Card>

      <LiveWalk />
    </>
  );
}

/**
 * A small live demonstration: take a short scramble and step back through it,
 * showing the position and the path at the same time.
 */
function LiveWalk(): JSX.Element {
  const moves = useAppState((s) => s.moves);
  const cursor = useAppState((s) => s.cursor);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => {
      const s = getState();
      if (s.cursor >= s.moves.length) { setPlaying(false); return; }
      actions.redo();
    }, Math.max(140, getState().turnSpeed + 60));
    return () => window.clearInterval(id);
  }, [playing]);

  if (moves.length === 0) return <></>;

  return (
    <Card
      title="Your path"
      note={`${cursor} of ${moves.length} moves applied`}
      className="stack"
      actions={
        <div className="row tight">
          <button className="btn small" onClick={() => actions.rewind()}>⏮</button>
          <button className="btn small" onClick={() => actions.undo()} disabled={cursor === 0}>◀</button>
          <button className="btn small" onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚' : '▶'}</button>
          <button className="btn small" onClick={() => actions.redo()} disabled={cursor >= moves.length}>▶|</button>
        </div>
      }
    >
      <Sequence moves={moves} cursor={cursor} onSeek={(i) => actions.seek(i)} />
      <div className="card-note">
        Notation: {moves.slice(0, cursor).map((m) => MOVE_NAMES[m]).join(' ') || '—'}
      </div>
    </Card>
  );
}
