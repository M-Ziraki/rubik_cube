import { useEffect, useMemo, useState } from 'react';
import { LessonBody, Quiz } from './framework';
import { Callout, Card, Sequence, Stat, formatApprox } from '../components/ui';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import { parseSequence } from '../cube/notation';
import { report } from '../cube/analysis';
import { requestPocketStats, preparePocket, requestStageStats, solveStage } from '../solver/client';
import type { PocketStats, StageStats } from '../solver/protocol';
import { METHODS } from '../data/methods';
import { TOTAL_STATES } from '../data/facts';

/* ============================================================= 8. groups --- */

export function LessonGroups(): JSX.Element {
  const [seq, setSeq] = useState("R U R' U'");
  const order = useMemo(() => {
    const moves = parseSequence(seq).moves;
    if (!moves.length) return 1;
    const c = CubieCube.identity();
    for (let k = 1; k <= 1300; k++) {
      c.applyMoves(moves);
      if (c.isSolved()) return k;
    }
    return -1;
  }, [seq]);

  return (
    <LessonBody>
      <p>
        The positions of a cube do not just form a set — they form a <strong>group</strong>. That
        one observation is what turns the puzzle from a curiosity into something with theorems.
      </p>

      <h3>What makes it a group</h3>
      <ul>
        <li>You can <strong>compose</strong> two positions: do the moves of one, then the other.</li>
        <li>There is an <strong>identity</strong>: the solved cube, or equivalently doing nothing.</li>
        <li>Every position has an <strong>inverse</strong>: run its moves backwards and negated.</li>
        <li>Composition is <strong>associative</strong>, though usually not commutative — <code>R U</code> and <code>U R</code> are different positions.</li>
      </ul>

      <h3>Order: how many times until you are home</h3>
      <p>
        Repeat any sequence often enough and the cube always returns to where it started. The number
        of repetitions is that element's <em>order</em>, and it divides the size of the group. Try
        some: <code>R U R&rsquo; U&rsquo;</code> takes 6 repetitions, <code>R U</code> takes 105,
        and <code>R U2 D&rsquo; B D&rsquo;</code> takes 1260 — the largest order anywhere in the
        cube group.
      </p>

      <Card title="Measure the order of a sequence" className="stack">
        <div className="row">
          <input type="text" value={seq} onChange={(e) => setSeq(e.target.value)} style={{ maxWidth: 320 }} />
          <div className="row tight">
            {["R U R' U'", 'R U', "R U2 D' B D'", "R L' F B'"].map((s) => (
              <button key={s} className="btn small ghost mono" onClick={() => setSeq(s)}>{s}</button>
            ))}
          </div>
        </div>
        <Stat
          value={order > 0 ? order : '—'}
          label="repetitions to return to solved"
          sub={order > 0 ? `${order} × ${parseSequence(seq).moves.length} = ${order * parseSequence(seq).moves.length} moves in total` : 'enter a valid sequence'}
        />
      </Card>

      <h3>Subgroups and cosets</h3>
      <p>
        A <strong>subgroup</strong> is a subset that is still a group on its own. Restrict yourself
        to only <code>U</code> and <code>D</code> turns and you can reach exactly 16 positions —
        a tiny subgroup. Allow <code>U</code>, <code>D</code> and the four half turns{' '}
        <code>L2 R2 F2 B2</code> and you can reach 19,508,428,800 — still only one two-billionth of
        the cube, but enormous in its own right. That subgroup has a name in this app: <code>G1</code>.
      </p>
      <p>
        A <strong>coset</strong> is a shifted copy of a subgroup. The whole cube group splits into
        2,217,093,120 disjoint copies of <code>G1</code>, and every position lives in exactly one of
        them. Both the two-phase algorithm and the proof of God's number are really statements
        about cosets: "get into the right coset, then walk home inside it".
      </p>

      <Quiz
        id="groups-q1"
        question={<>Why does every sequence eventually return the cube to solved if you repeat it enough?</>}
        options={[
          'Because the cube has a finite number of positions, so repeating must eventually revisit one — and the first revisit has to be the start',
          'Because every move has order 4',
          'It does not; some sequences never return',
          'Because the moves commute',
        ]}
        correct={0}
        explain={
          <p style={{ marginBottom: 0 }}>
            In a finite group every element has finite order. Repeating a sequence traces a cycle,
            and since every step is reversible the cycle must close at the identity rather than
            somewhere in the middle.
          </p>
        }
      />
    </LessonBody>
  );
}

/* ======================================================= 9. the ladder --- */

export function LessonLadder(): JSX.Element {
  const [stats, setStats] = useState<StageStats | null>(null);
  const [moves, setMoves] = useState<number[]>([]);
  const [hint, setHint] = useState<{ moves: number[]; distance: number; goal: string } | null>(null);
  const [scramble] = useState("R U2 F' L D B R' U F2 D'");

  const cube = useMemo(() => CubieCube.fromMoves(parseSequence(scramble).moves).applyMoves(moves), [scramble, moves]);
  const r = useMemo(() => report(cube), [cube]);

  useEffect(() => { requestStageStats().then(setStats).catch(() => undefined); }, []);

  const askHint = async (stage: 'edge-orientation' | 'cross' | 'g1'): Promise<void> => {
    const res = await solveStage(faceletString(toFacelets(cube)), stage);
    setHint({ moves: res.moves, distance: res.distance, goal: res.goal });
  };

  return (
    <LessonBody>
      <p>
        In 1981 Morwen Thistlethwaite had an idea that still underlies every fast solver: instead of
        searching the whole group at once, climb down a <strong>ladder of nested subgroups</strong>.
        Each rung restricts which turns you are still allowed, which shrinks the space enough to
        solve by table lookup.
      </p>

      <div className="scroll-x">
        <table className="data">
          <thead><tr><th>rung</th><th>generators still allowed</th><th className="num">size</th><th>what it means</th></tr></thead>
          <tbody>
            <tr><td>G₀</td><td><code>U D L R F B</code></td><td className="num">4.3 × 10¹⁹</td><td>anything at all</td></tr>
            <tr><td>G₁</td><td><code>U D L R F2 B2</code></td><td className="num">2.1 × 10¹⁶</td><td>every edge oriented</td></tr>
            <tr><td>G₂</td><td><code>U D L2 R2 F2 B2</code></td><td className="num">1.95 × 10¹⁰</td><td>corners oriented too, slice edges home</td></tr>
            <tr><td>G₃</td><td><code>U2 D2 L2 R2 F2 B2</code></td><td className="num">663,552</td><td>every piece in its own orbit</td></tr>
            <tr><td>G₄</td><td>—</td><td className="num">1</td><td>solved</td></tr>
          </tbody>
        </table>
      </div>

      <p>
        Kociemba's insight, five years later, was that the middle two rungs could be merged: go
        straight from anything into <code>G1 = ⟨U, D, L², R², F², B²⟩</code>, which takes at most 12
        moves, then solve inside it, which takes at most 18. That is the two-phase algorithm, and
        it is what the <a href="#/solver">Solvers page</a> runs.
      </p>

      {stats ? (
        <div className="grid two">
          <Card title="Rung one, completely tabulated" note="orienting all twelve edges">
            <p>
              There are only {stats.flip.size.toLocaleString('en-US')} possible edge-orientation
              patterns, so every one of them has been solved by brute force. The worst needs{' '}
              <strong>{stats.flip.diameter}</strong> moves.
            </p>
            <Histogram data={stats.flip.histogram} />
          </Card>
          <Card title="The human first rung" note="the bottom cross">
            <p>
              Tracking four edges gives {stats.cross.size.toLocaleString('en-US')} states — also
              fully solvable by table. The hardest cross takes <strong>{stats.cross.diameter}</strong>{' '}
              moves, which is why speedcubers are told to plan the whole cross before starting.
            </p>
            <Histogram data={stats.cross.histogram} />
          </Card>
        </div>
      ) : null}

      <Card title="Climb the first rung yourself" className="stack">
        <p style={{ marginBottom: 0 }}>
          Scramble: <code>{scramble}</code>. Get every edge oriented, then get into G1. The
          counters tell you how close you are; the buttons will give you a provably shortest route
          to each sub-goal if you want to compare.
        </p>
        <div className="split" style={{ gap: 14 }}>
          <Cube3D facelets={faceletString(toFacelets(cube))} interactive={false} height={250} />
          <div className="stack">
            <MovePad onMove={(m) => setMoves((x) => [...x, m])} keyboard={false} />
            <div className="row tight">
              <button className="btn small" onClick={() => setMoves((x) => x.slice(0, -1))} disabled={!moves.length}>Undo</button>
              <button className="btn small ghost" onClick={() => { setMoves([]); setHint(null); }}>Reset</button>
              <button className="btn small" onClick={() => askHint('edge-orientation')}>Optimal edge orientation</button>
              <button className="btn small" onClick={() => askHint('g1')}>Optimal route into G1</button>
            </div>
            <div className="row" style={{ gap: 16 }}>
              <Stat value={`${r.orientedEdges}/12`} label="edges oriented" />
              <Stat value={`${r.orientedCorners}/8`} label="corners oriented" />
              <Stat value={`${r.sliceEdgesHome}/4`} label="slice edges home" />
            </div>
            {r.inG1 ? (
              <Callout title="You are in G1">
                <p style={{ margin: 0 }}>
                  From here the cube can be finished using nothing but <code>U</code>, <code>D</code>{' '}
                  and half turns — at most 18 more moves. Try it: every other quarter turn is now
                  a step backwards.
                </p>
              </Callout>
            ) : null}
            {hint ? (
              <div>
                <div className="card-note" style={{ marginBottom: 4 }}>
                  Shortest route to {hint.goal} — {hint.distance} move{hint.distance === 1 ? '' : 's'}
                </div>
                <Sequence moves={hint.moves} />
                <button className="btn small" style={{ marginTop: 6 }} onClick={() => { setMoves((x) => [...x, ...hint.moves]); setHint(null); }}>Apply</button>
              </div>
            ) : null}
            <div className="card-note">your moves: <code>{moves.length}</code></div>
          </div>
        </div>
      </Card>

      <Quiz
        id="ladder-q1"
        question={<>Why does the ladder produce longer solutions than an optimal search?</>}
        options={[
          'Because the tables are approximate',
          'Because each rung is solved optimally in isolation, and the best route down the whole ladder need not pass through the best route on each rung',
          'Because it uses fewer generators',
          'It does not — it is optimal',
        ]}
        correct={1}
        explain={
          <p style={{ marginBottom: 0 }}>
            This is the central trade-off of the whole field. Decomposing a hard problem into easy
            sub-problems makes it solvable; it also throws away the possibility that a worse first
            step leads to a much better second one. The two-phase algorithm claws some of this back
            by deliberately trying <em>worse</em> phase-one routes to find shorter phase-two tails.
          </p>
        }
      />
    </LessonBody>
  );
}

function Histogram({ data }: { data: number[] }): JSX.Element {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div
            title={`${v.toLocaleString('en-US')} at distance ${i}`}
            style={{ height: `${Math.max(2, (v / max) * 46)}px`, background: 'var(--accent)', borderRadius: '2px 2px 0 0' }}
          />
          <span style={{ fontSize: '0.6rem', color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>{i}</span>
        </div>
      ))}
    </div>
  );
}

/* ===================================================== 10. god's number --- */

export function LessonGodsNumber(): JSX.Element {
  const [pocket, setPocket] = useState<PocketStats | null>(null);
  useEffect(() => { preparePocket().then(requestPocketStats).then(setPocket).catch(() => undefined); }, []);

  return (
    <LessonBody>
      <p>
        "Every position can be solved in 20 moves or fewer" is a theorem, and it is worth
        understanding how such a thing gets proved — because the method is not clever, it is
        relentless.
      </p>

      <h3>The two halves of the claim</h3>
      <ul>
        <li>
          <strong>Twenty is enough.</strong> This is an upper bound and it is hard: you must show
          that <em>no</em> position needs 21, which means accounting for all 43 quintillion of them.
        </li>
        <li>
          <strong>Twenty is needed.</strong> This is a lower bound and it is comparatively easy:
          exhibit one position that provably cannot be done in 19. The superflip was known to be
          such a position in 1995, fifteen years before the upper bound came down to meet it.
        </li>
      </ul>

      <h3>How the upper bound was closed</h3>
      <p>
        Rokicki, Kociemba, Davidson and Dethridge partitioned the cube into 2,217,093,120 cosets of
        the subgroup <code>⟨U, D, L², R², F², B²⟩</code>. Symmetry collapses those to 55,882,296 that
        genuinely need checking. For each one, a program showed that every position it contains can
        be solved in 20 moves — not by finding the optimal solution for each, which would have been
        impossible, but by finding <em>some</em> solution of length ≤ 20 for all of them at once.
        The whole computation took about 35 CPU-years on hardware donated by Google, and finished
        in July 2010.
      </p>

      <Callout title="The shortcut that made it possible">
        <p style={{ marginBottom: 0 }}>
          Solving 43 quintillion positions individually is impossible. Solving two billion
          <em> sets</em> of positions, where each set shares most of its structure, is merely very
          hard. That reduction — from positions to cosets — is the entire proof strategy.
        </p>
      </Callout>

      {pocket ? (
        <Card title="The same proof, at a size you can watch" className="stack">
          <p>
            The 2×2×2 has {pocket.states.toLocaleString('en-US')} positions — about{' '}
            {formatApprox(TOTAL_STATES / pocket.states)} times fewer. That is few enough to simply
            visit them all, which this page did in <strong>{pocket.millis} ms</strong>. The result
            is not an estimate or a bound: it is the complete answer.
          </p>
          <div className="row" style={{ gap: 20 }}>
            <Stat value={pocket.godsNumber} label="God's number for the 2×2×2" sub="computed here, not quoted" />
            <Stat value={pocket.histogram[pocket.godsNumber].toLocaleString('en-US')} label="positions that need all of them" />
            <Stat value={formatApprox(pocket.states)} label="positions checked" />
          </div>
          <p style={{ marginBottom: 0 }} className="card-note">
            Exactly the same method, exactly the same certainty. The only difference between this
            and the 2010 proof is thirteen orders of magnitude — and thirteen orders of magnitude is
            the difference between a moment and a datacentre.
          </p>
          <a className="btn" href="#/graph">Open the 2×2×2 atlas</a>
        </Card>
      ) : null}

      <Quiz
        id="gods-q1"
        question={<>A solver returns an 18-move solution for a scrambled cube. What can you conclude?</>}
        options={[
          'The position is exactly 18 moves from solved',
          'The position is at most 18 moves from solved',
          'The position is at least 18 moves from solved',
          'Nothing, without knowing which solver it was',
        ]}
        correct={1}
        explain={
          <p style={{ marginBottom: 0 }}>
            Any solution is an upper bound on the distance. To claim the distance <em>is</em> 18 you
            need the other half: a proof that 17 is impossible. That is what the optimal solver
            provides and the two-phase solver does not — and why this app labels every answer with
            what it can actually promise.
          </p>
        }
      />
    </LessonBody>
  );
}

/* ================================================= 11. humans vs machines --- */

export function LessonHumanVsMachine(): JSX.Element {
  const max = Math.max(...METHODS.map((m) => m.typicalMoves));
  return (
    <LessonBody>
      <p>
        It is tempting to think that a human method is just a worse version of what a computer
        does. It is not. They are solving different problems under different constraints, and the
        gap between 55 moves and 18 is almost entirely explained by three things a human cannot do.
      </p>

      <h3>What a computer has that you do not</h3>
      <ul>
        <li>
          <strong>Memory measured in millions.</strong> The solver consults tables with millions of
          exact answers. You can hold perhaps a hundred algorithms, and recalling one takes a
          second.
        </li>
        <li>
          <strong>Willingness to go backwards.</strong> An optimal solution routinely destroys
          finished work because it leads somewhere better. Humans protect what they have solved,
          because they cannot see far enough ahead to know that breaking it pays.
        </li>
        <li>
          <strong>Search instead of recognition.</strong> A human method is a decision tree over
          memorised cases. A solver explores millions of positions per second. These are not the
          same activity.
        </li>
      </ul>

      <Card title="The same scramble, different worlds">
        <div className="stack" style={{ gap: 10 }}>
          {METHODS.map((m) => (
            <div key={m.name}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '0.92rem' }}>{m.name}</strong>
                <span className="card-note">{m.typicalMoves} moves</span>
              </div>
              <div className="meter"><i style={{ width: `${(m.typicalMoves / max) * 100}%` }} /></div>
              <div className="card-note">{m.whyNotOptimal}</div>
            </div>
          ))}
        </div>
      </Card>

      <h3>So what is actually achievable?</h3>
      <p>
        Being honest about this matters more than being encouraging. Nobody finds 20-move solutions
        at the table — not world champions, not the people who wrote the solvers. What is genuinely
        within reach, with real practice:
      </p>
      <ul>
        <li><strong>Executing</strong> a computed 20-move solution on a physical cube. Entirely achievable today, from <a href="#/scan">your cube</a>.</li>
        <li><strong>Verifying</strong> that a solution is optimal, for positions close enough to solved. The optimal solver here does that.</li>
        <li><strong>Reading</strong> a cube the way a solver does — counting misoriented edges, spotting when you are in G1.</li>
        <li><strong>Solving by hand in the forties</strong> using block building or the subgroup ladder, rather than the hundreds a beginner method takes.</li>
      </ul>
      <p>
        That last one is the real prize, and it is the only item on the list that takes months
        rather than minutes. The <a href="#/training">training page</a> measures exactly how far
        from optimal your own solutions are, which is the only honest way to make progress on it.
      </p>

      <Quiz
        id="human-q1"
        question={<>Why do human methods spend so many moves on the last layer?</>}
        options={[
          'The last layer is mathematically the hardest part',
          'Because every last-layer algorithm must leave the first two layers untouched, which costs a great deal of setting up and undoing',
          'Because people learn them badly',
          'Because the pieces are further from home',
        ]}
        correct={1}
        explain={
          <p style={{ marginBottom: 0 }}>
            A last-layer algorithm has to be a <em>commutator-like</em> sequence that returns
            everything below it to where it was. That constraint is expensive — typically 8 to 15
            moves to achieve what an unconstrained search would do in 5. An optimal solver has no
            such constraint, and it shows.
          </p>
        }
      />
    </LessonBody>
  );
}
