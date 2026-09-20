import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { PocketNet } from '../components/PocketNet';
import { GraphCanvas } from '../graph/GraphCanvas';
import { ShellCanvas } from '../graph/ShellCanvas';
import { Callout, Card, Segmented, Sequence, Stat, formatApprox } from '../components/ui';
import { actions, currentFacelets, useAppState } from '../state/store';
import {
  preparePocket, requestNeighbourhood, requestPocketStats, requestScramble, scramblePocket, solvePocketState,
} from '../solver/client';
import type { GraphPayload, PocketStats } from '../solver/protocol';
import { MOVE_NAMES, N_MOVES } from '../cube/defs';
import { HTM_DISTANCE_DISTRIBUTION, TOTAL_STATES } from '../data/facts';

type View = 'near' | 'pocket' | 'growth';

export function GraphPage(): JSX.Element {
  const [view, setView] = useState<View>('near');
  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Laboratory</div>
        <h1>The state space</h1>
        <p className="lede">
          A different object from the sticker map on the <a href="#/">Atlas</a>. There, each dot is
          one of 54 stickers and the whole picture is a single position. Here, each dot is an{' '}
          <em>entire position</em> — all 54 stickers at once — and the edges are face turns
          between them. That graph has 43,252,003,274,489,856,000 vertices, so it can only be seen
          three ways: a small neighbourhood in full detail, a smaller puzzle in <em>complete</em>{' '}
          detail, and the shape of the whole thing in summary.
        </p>
        <div style={{ marginTop: 12 }}>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'near', label: 'Neighbourhood' },
              { value: 'pocket', label: '2×2×2 atlas' },
              { value: 'growth', label: 'Growth & shape' },
            ]}
          />
        </div>
      </header>
      {view === 'near' ? <NeighbourhoodView /> : view === 'pocket' ? <PocketView /> : <GrowthView />}
    </>
  );
}

/* ---------------------------------------------------------- neighbourhood --- */

function NeighbourhoodView(): JSX.Element {
  const state = useAppState((s) => s);
  const facelets = useMemo(() => currentFacelets(state), [state.origin, state.cursor, state.moves]);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [depth, setDepth] = useState(2);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const token = useRef(0);

  useEffect(() => {
    if (!state.tablesReady) return;
    const t = ++token.current;
    setBusy(true);
    requestNeighbourhood(facelets, depth, depth >= 3 ? 4000 : 1000)
      .then((g) => { if (t === token.current) { setGraph(g); setSelected(null); } })
      .finally(() => { if (t === token.current) setBusy(false); });
  }, [facelets, depth, state.tablesReady]);

  const pathToSelected = useMemo(() => {
    if (!graph || selected === null) return [];
    const chain: number[] = [];
    let cur = selected;
    while (cur >= 0) { chain.unshift(cur); cur = graph.nodes[cur].parent; }
    return chain;
  }, [graph, selected]);

  const movesToSelected = useMemo(() => {
    if (!graph || selected === null) return [];
    const out: number[] = [];
    let cur = selected;
    while (cur >= 0 && graph.nodes[cur].parent >= 0) {
      out.unshift(graph.nodes[cur].viaMove);
      cur = graph.nodes[cur].parent;
    }
    return out;
  }, [graph, selected]);

  const duplicates = useMemo(() => {
    if (!graph) return 0;
    // How many of the edges lead somewhere already reachable more cheaply?
    return graph.edges.length - (graph.nodes.length - 1);
  }, [graph]);

  return (
    <div className="split">
      <div className="stack">
        <Card
          title="Explore from here"
          note={graph ? `${graph.nodes.length} distinct positions, ${graph.edges.length} moves drawn` : 'building…'}
          actions={
            <div className="row tight">
              <div className="seg">
                {[1, 2, 3].map((d) => (
                  <button key={d} aria-pressed={depth === d} onClick={() => setDepth(d)}>{d}</button>
                ))}
              </div>
              <button className="btn small" onClick={async () => {
                const r = await requestScramble(12, false);
                actions.setPosition(r.facelets, r.moves);
              }}>New position</button>
            </div>
          }
        >
          {busy && !graph ? <div className="shimmer" style={{ height: 460 }} /> : (
            <GraphCanvas
              graph={graph}
              height={460}
              path={pathToSelected}
              selected={selected}
              onSelect={(n) => setSelected(n.id)}
              caption="click to select · drag to pan · scroll to zoom"
            />
          )}
        </Card>

        <Card title="Why the rings do not grow eighteen-fold">
          <p>
            Every position has exactly 18 neighbours, so a naive count says the first ring should
            hold 18 positions, the second 324, the third 5,832. The true counts are{' '}
            <strong>18</strong>, <strong>243</strong> and <strong>3,240</strong>. Two things shrink
            them: turning the same face twice in a row is never new, and turning two opposite faces
            commutes, so <code>U D</code> and <code>D U</code> land in the same place.
          </p>
          <p style={{ marginBottom: 0 }}>
            In the picture above, {duplicates > 0 ? <>{duplicates} of the drawn edges close a loop rather than opening new ground.</> : 'every drawn edge opens new ground at this depth.'}
            {' '}That redundancy is what makes the graph interesting — and what makes finding the
            <em> shortest</em> route hard.
          </p>
        </Card>
      </div>

      <div className="stack">
        <Card title="Selected position" note={selected === null ? 'nothing selected' : `${movesToSelected.length} move${movesToSelected.length === 1 ? '' : 's'} away`}>
          {selected !== null && graph ? (
            <>
              <Cube3D facelets={graph.nodes[selected].facelets} interactive={false} />
              <div style={{ marginTop: 10 }}>
                <div className="card-note" style={{ marginBottom: 4 }}>Route from the centre</div>
                <Sequence moves={movesToSelected} />
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => actions.applyMoves(movesToSelected)}>Travel here</button>
              </div>
            </>
          ) : (
            <p className="card-note" style={{ margin: 0 }}>
              Click any dot in the map to inspect that position and the turns that reach it.
            </p>
          )}
        </Card>

        <Card title="Your cube">
          <Cube3D />
        </Card>

        <Callout title="Reading the picture">
          <p style={{ marginBottom: 0 }}>
            Straight spokes are the shortest route found to each position — the breadth-first tree.
            The faint curved strands are the other moves: edges that join two positions already on
            the map. Those are the cycles, and every cycle is an identity of the cube group, like
            <code> U D U&rsquo; D&rsquo; </code>doing nothing at all.
          </p>
        </Callout>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- pocket --- */

function PocketView(): JSX.Element {
  const [stats, setStats] = useState<PocketStats | null>(null);
  const [building, setBuilding] = useState(false);
  const [distance, setDistance] = useState(0);
  const [solution, setSolution] = useState<number[]>([]);
  const [frames, setFrames] = useState<number[][]>([]);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(7);

  useEffect(() => {
    setBuilding(true);
    preparePocket()
      .then(() => requestPocketStats())
      .then(setStats)
      .finally(() => setBuilding(false));
  }, []);

  const shells = useMemo(
    () => (stats ? stats.histogram.map((count, d) => ({
      distance: d, count, exact: true,
      sample: d === 0 ? 1 : Math.max(4, Math.round(Math.log10(Math.max(10, count)) * 12)),
    })) : []),
    [stats],
  );

  const current = useMemo(
    () => Uint8Array.from(frames[Math.min(step, Math.max(0, frames.length - 1))] ?? new Array(24).fill(0)),
    [frames, step],
  );

  const scrambleTo = async (d: number): Promise<void> => {
    const r = await scramblePocket(d);
    setDistance(r.distance);
    setFrames([r.stickers]);
    setStep(0);
    const s = await solvePocketState(r.index);
    setSolution(s.moves);
    setFrames(s.frames);
  };

  return (
    <div className="split">
      <div className="stack">
        <Card
          title="The whole graph of the 2×2×2"
          note={stats ? `${stats.states.toLocaleString('en-US')} positions, every one of them measured in ${stats.millis} ms in this browser` : 'enumerating…'}
        >
          {building || !stats ? <div className="shimmer" style={{ height: 420 }} /> : (
            <ShellCanvas
              spec={shells}
              height={420}
              highlight={distance || null}
              subtitle="Every ring is exact. No estimates, no sampling of the counts — this is the complete distance profile of the puzzle."
            />
          )}
        </Card>

        {stats ? (
          <Callout title={`God's number for the 2×2×2 is ${stats.godsNumber}`}>
            <p>
              Not quoted from a paper — computed here, just now, by visiting all{' '}
              {stats.states.toLocaleString('en-US')} positions and recording how far each one is
              from solved. The furthest are {stats.godsNumber} moves away, and there are exactly{' '}
              {stats.histogram[stats.godsNumber].toLocaleString('en-US')} of them.
            </p>
            <p style={{ marginBottom: 0 }}>
              This is the same method that settled the 3×3×3 at 20 — exhaustive search. The only
              difference is scale: {formatApprox(TOTAL_STATES / stats.states)} times more positions,
              which is why that proof needed a datacentre and this one needed a moment.
            </p>
          </Callout>
        ) : null}
      </div>

      <div className="stack">
        <Card
          title="Walk an optimal path"
          note={solution.length ? `${distance} moves from solved` : 'pick a distance'}
        >
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="field" style={{ flex: 1 }}>
              Start {target} moves from solved
              <input
                type="range" min={1} max={stats?.godsNumber ?? 11} value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
              />
            </label>
            <button className="btn primary" onClick={() => scrambleTo(target)} disabled={!stats}>Scramble</button>
          </div>

          <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
            <PocketNet stickers={current} size={26} label={`${Math.max(0, distance - step)} moves from solved`} />
          </div>

          {solution.length ? (
            <>
              <div className="row tight" style={{ marginBottom: 8 }}>
                <button className="btn small" onClick={() => setStep(0)}>⏮</button>
                <button className="btn small" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>◀</button>
                <button className="btn small" onClick={() => setStep((s) => Math.min(solution.length, s + 1))} disabled={step >= solution.length}>▶</button>
                <span className="card-note">{step} / {solution.length}</span>
              </div>
              <div className="seq">
                {solution.map((m, i) => (
                  <span
                    key={i}
                    className={`move-chip ${i < step ? 'done' : i === step ? 'current' : ''}`}
                    style={{ cursor: 'default' }}
                  >
                    {MOVE_NAMES[m]}
                  </span>
                ))}
              </div>
              <p className="card-note" style={{ marginTop: 10, marginBottom: 0 }}>
                This route is <strong>provably shortest</strong> — it was read straight out of the
                complete distance table, by stepping to any neighbour one move closer to home. No
                search, no heuristics.
              </p>
            </>
          ) : null}
        </Card>

        {stats ? (
          <Card title="Exact distance profile">
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th className="num">moves</th><th className="num">positions</th><th>share</th></tr></thead>
                <tbody>
                  {stats.histogram.map((count, d) => (
                    <tr key={d} style={d === distance ? { background: 'var(--accent-soft)' } : undefined}>
                      <td className="num">{d}</td>
                      <td className="num">{count.toLocaleString('en-US')}</td>
                      <td>
                        <div className="meter"><i style={{ width: `${(count / Math.max(...stats.histogram)) * 100}%` }} /></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- growth --- */

function GrowthView(): JSX.Element {
  const rows = HTM_DISTANCE_DISTRIBUTION;
  const [focus, setFocus] = useState<number | null>(null);
  const maxLog = Math.log10(Math.max(...rows.map((r) => r.count)));

  return (
    <div className="stack">
      <Card title="How fast the graph grows" note="each bar is a distance shell, on a logarithmic scale">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 200, marginBottom: 10 }}>
          {rows.map((r) => (
            <div
              key={r.distance}
              onMouseEnter={() => setFocus(r.distance)}
              onMouseLeave={() => setFocus(null)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}
            >
              <div
                title={`${r.count.toLocaleString('en-US')} positions`}
                style={{
                  width: '100%',
                  height: `${Math.max(2, (Math.log10(Math.max(1, r.count)) / maxLog) * 170)}px`,
                  background: r.exact ? 'var(--accent)' : 'var(--warn)',
                  opacity: focus === null || focus === r.distance ? 1 : 0.4,
                  borderRadius: '3px 3px 0 0',
                }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>{r.distance}</span>
            </div>
          ))}
        </div>
        <div className="row">
          <span className="tag ok">exact counts</span>
          <span className="tag warn">published estimates</span>
          {focus !== null ? (
            <span className="card-note">
              distance {focus}: {rows[focus].count.toLocaleString('en-US')} positions
              ({((rows[focus].count / TOTAL_STATES) * 100).toPrecision(3)}% of the cube)
            </span>
          ) : null}
        </div>
      </Card>

      <div className="grid two">
        <Card title="Branching factor">
          <div className="row" style={{ gap: 20 }}>
            <Stat value={N_MOVES} label="moves available" sub="6 faces × 3 turns" />
            <Stat value="13.35" label="effective branching" sub="after discarding repeats and commuting pairs" />
          </div>
          <p style={{ marginTop: 12, marginBottom: 0 }}>
            At 13.35 branches per move, a depth-20 search would visit about 10²² positions — five
            hundred times more than there are positions in the first place. Any honest optimal
            solver has to beat that number down with lower bounds, and even then it only wins for
            positions fairly close to home.
          </p>
        </Card>

        <Card title="Why 20 and not 21">
          <p>
            The upper bound came down over decades: 52 moves in 1981, 29 by 1995, 22 by 2008, and
            20 in 2010. The lower bound was much easier — the superflip was known to need 20 moves
            long before anyone could show that nothing needs 21.
          </p>
          <p style={{ marginBottom: 0 }}>
            Rokicki, Kociemba, Davidson and Dethridge closed the gap by partitioning the cube into
            2,217,093,120 cosets of a large subgroup, exploiting symmetry to cut that to
            55,882,296 that actually needed work, and solving each one to a bound of 20 on donated
            Google hardware — around 35 CPU-years in total.
          </p>
        </Card>
      </div>
    </div>
  );
}
