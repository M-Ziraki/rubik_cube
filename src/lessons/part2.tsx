import { useEffect, useState } from 'react';
import { CubeTask, LessonBody, NumberQuiz, Quiz } from './framework';
import { Callout, Card, Sequence, Stat, formatApprox } from '../components/ui';
import { GraphCanvas } from '../graph/GraphCanvas';
import { Cube3D } from '../components/Cube3D';
import { requestNeighbourhood, requestPocketStats, preparePocket } from '../solver/client';
import type { GraphPayload, PocketStats } from '../solver/protocol';
import { SOLVED_FACELETS } from '../cube/defs';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import { parseSequence } from '../cube/notation';
import { HTM_DISTANCE_DISTRIBUTION, TOTAL_STATES } from '../data/facts';

/* ============================================================== 4. graph --- */

export function LessonGraph(): JSX.Element {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [depth, setDepth] = useState(2);

  useEffect(() => {
    requestNeighbourhood(SOLVED_FACELETS, depth, depth >= 3 ? 3500 : 900).then(setGraph).catch(() => undefined);
  }, [depth]);

  return (
    <LessonBody>
      <p>
        Here is the whole idea, stated once, precisely.
      </p>
      <Callout title="The cube as a graph">
        <ul style={{ marginBottom: 0 }}>
          <li>Each of the 43,252,003,274,489,856,000 positions is a <strong>vertex</strong>.</li>
          <li>Two vertices are joined by an <strong>edge</strong> when one face turn takes you between them.</li>
          <li>A <strong>scramble</strong> is a walk away from the solved vertex.</li>
          <li>A <strong>solution</strong> is a walk back. A <strong>shortest</strong> solution is a shortest path.</li>
        </ul>
      </Callout>

      <p>
        Every vertex has exactly 18 edges, because there are always 18 legal turns. The graph is
        also <em>undirected</em>: if <code>R</code> takes you from A to B, then <code>R&rsquo;</code>{' '}
        takes you from B back to A. And it is <em>vertex-transitive</em> — every position looks
        exactly like every other from the inside. The solved state is not special in the graph; it
        is only special because it is the one we happen to be aiming at.
      </p>

      <Card title="The first few rings, drawn in full" note="starting from the solved cube">
        <div className="seg" style={{ marginBottom: 10 }}>
          {[1, 2, 3].map((d) => (
            <button key={d} aria-pressed={depth === d} onClick={() => setDepth(d)}>within {d}</button>
          ))}
        </div>
        <GraphCanvas graph={graph} height={380} caption="hover a dot" />
      </Card>

      <h3>Why the rings are smaller than you would guess</h3>
      <p>
        Eighteen moves from every vertex suggests 18 positions at distance 1, then 18 × 18 = 324 at
        distance 2. The true counts are 18 and <strong>243</strong>. Two effects collapse the rest:
      </p>
      <ul>
        <li>Turning the same face twice in a row is never new — <code>R</code> then <code>R2</code> is just <code>R&rsquo;</code>.</li>
        <li>Opposite faces commute — <code>U D</code> and <code>D U</code> land on the same vertex.</li>
      </ul>
      <p>
        Discounting both, the branching factor settles at about <strong>13.35</strong> rather than
        18. That number matters enormously: it is the base of the exponential every search has to
        fight.
      </p>

      <NumberQuiz
        id="graph-q1"
        question={<p style={{ marginBottom: 0 }}>How many positions are exactly three face turns from solved?</p>}
        answer={3240}
        explain={<p style={{ marginBottom: 0 }}>18, 243, 3,240, 43,239, 574,908 — the first five rings. Growth is fast but not quite 18-fold, for the reasons above.</p>}
      />

      <Quiz
        id="graph-q2"
        question={<>Two different sequences of four moves end at the same position. What does that tell you about the graph?</>}
        options={[
          'Nothing — it is a coincidence',
          'The graph contains a cycle of length at most eight',
          'One of the sequences must be wrong',
          'The position is closer than four moves from solved',
        ]}
        correct={1}
        explain={
          <p style={{ marginBottom: 0 }}>
            Follow one sequence forwards and the other backwards and you have a closed walk of
            eight moves. Every such cycle is an identity of the cube group, and those identities are
            exactly what make counting distinct positions harder than counting sequences.
          </p>
        }
      />
    </LessonBody>
  );
}

/* =========================================================== 5. distance --- */

export function LessonDistance(): JSX.Element {
  const [focus, setFocus] = useState(18);
  const row = HTM_DISTANCE_DISTRIBUTION[focus];

  return (
    <LessonBody>
      <p>
        <strong>Distance</strong> means the fewest face turns between two positions. The distance
        from a position to solved is often called its <em>depth</em>, and the largest depth
        anywhere in the graph is its <em>diameter</em> — which for this graph is God's number, 20.
      </p>

      <Card title="How the puzzle is distributed" className="stack">
        <input
          type="range" min={0} max={20} value={focus}
          onChange={(e) => setFocus(Number(e.target.value))}
        />
        <div className="row" style={{ gap: 20 }}>
          <Stat value={focus} label="moves from solved" />
          <Stat value={formatApprox(row.count)} label="positions" sub={row.exact ? 'exact count' : 'published estimate'} />
          <Stat
            value={`${((row.count / TOTAL_STATES) * 100).toPrecision(3)}%`}
            label="of the whole cube"
          />
        </div>
        <div className="meter"><i style={{ width: `${(row.count / 2.9e19) * 100}%` }} /></div>
      </Card>

      <h3>Three facts worth sitting with</h3>
      <ul>
        <li>
          <strong>Nearly everything is far away.</strong> About 67% of all positions are exactly 18
          moves from solved, and virtually all the rest are 17. Pick a cube at random and you can
          bet on 17 or 18 and be right more than 95% of the time.
        </li>
        <li>
          <strong>Nearly nothing is close.</strong> Everything within 10 moves — 232 billion
          positions — is about one five-hundred-millionth of the puzzle. A "nearly solved" cube is
          an astronomically unlikely thing to meet by chance.
        </li>
        <li>
          <strong>The worst case is vanishingly rare.</strong> Only a few hundred million positions
          need all 20 moves. They exist, which is why God's number is 20 and not 19 — but you will
          never scramble into one.
        </li>
      </ul>

      <Callout title="The shape of a big graph">
        <p style={{ marginBottom: 0 }}>
          This shape — almost all vertices piled up at nearly the maximum distance — is what
          exponential growth looks like from the inside. Each ring is about thirteen times the
          last, so the outermost rings contain almost the entire graph. It is the same reason a
          binary tree has more leaves than all its internal nodes combined.
        </p>
      </Callout>

      <Quiz
        id="distance-q1"
        question={<>You scramble a cube with 25 random turns. Roughly how far from solved is it likely to be?</>}
        options={['About 25 moves', 'About 20 moves — the maximum', 'About 17 or 18 moves', 'It could be anything from 0 to 20 with equal chance']}
        correct={2}
        explain={
          <p style={{ marginBottom: 0 }}>
            Twenty-five random turns lands you somewhere close to a uniformly random position, and
            random positions are 17 or 18 moves out almost every time. Note how little the scramble
            length matters once it is past about fifteen: the walk saturates.
          </p>
        }
      />
    </LessonBody>
  );
}

/* ============================================================= 6. search --- */

export function LessonSearch(): JSX.Element {
  const [depth, setDepth] = useState(10);
  const bf = 13.35;
  const nodes = Math.pow(bf, depth);
  const perSecond = 20e6;

  return (
    <LessonBody>
      <p>
        Knowing that a shortest path exists is not the same as being able to find one. Here is what
        each standard approach actually costs on this graph.
      </p>

      <h3>Breadth-first search</h3>
      <p>
        Explore every position one move away, then every position two moves away, and so on. It
        finds the shortest path, guaranteed. It also has to <em>remember</em> every position it has
        seen, and the rings grow thirteen-fold. By depth 10 you are storing 232 billion positions;
        by depth 14 you are past what any machine has ever held in memory. BFS is perfect and
        useless.
      </p>

      <h3>Depth-first search</h3>
      <p>
        Uses almost no memory — just the current path. But it will happily wander twenty moves down
        a hopeless branch and it gives you no guarantee the first solution it finds is short.
      </p>

      <h3>Iterative deepening (IDA*)</h3>
      <p>
        Do a depth-first search limited to 1 move. If that fails, try limited to 2. Then 3. You get
        BFS's guarantee with DFS's memory, and the wasted repetition is small — because the last
        ring is thirteen times bigger than all previous ones put together, re-searching them costs
        under 10% extra. This is what every solver in this app uses.
      </p>

      <Card title="What a depth actually costs" className="stack">
        <label className="field">
          Search depth: {depth}
          <input type="range" min={1} max={20} value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
        </label>
        <div className="row" style={{ gap: 20 }}>
          <Stat value={formatApprox(nodes)} label="positions to visit" sub="at a branching factor of 13.35" />
          <Stat
            value={humanTime(nodes / perSecond)}
            label="at 20 million per second"
            sub="a generous rate for a browser"
          />
        </div>
        {depth >= 14 ? (
          <Callout kind="warn" title="This is why heuristics exist">
            <p style={{ marginBottom: 0 }}>
              Unguided search of this depth is hopeless. The next lesson is about the one trick
              that makes it possible anyway: never expanding a branch that provably cannot reach
              the goal in time.
            </p>
          </Callout>
        ) : null}
      </Card>

      <h3>Meeting in the middle</h3>
      <p>
        A clever variation: search 9 moves forwards from the scramble and 9 moves backwards from
        solved, and look for a position both searches reached. That finds an 18-move solution while
        only ever searching to depth 9 — the square root of the work. It is a genuine improvement,
        and it is still far too much: depth 9 is 17.6 billion positions, twice over.
      </p>

      <Quiz
        id="search-q1"
        question={<>Why does iterative deepening not waste most of its time re-searching shallow depths?</>}
        options={[
          'It caches the results of earlier passes',
          'Because the last level contains most of the nodes, so earlier levels add under about 10%',
          'It skips levels it has already searched',
          'It does waste most of its time, but memory matters more',
        ]}
        correct={1}
        explain={
          <p style={{ marginBottom: 0 }}>
            With branching factor b, all the levels before the last add up to roughly 1/(b−1) of the
            last one. At b ≈ 13, that is about 8%. Exponential growth, for once, working in your
            favour.
          </p>
        }
      />
    </LessonBody>
  );
}

function humanTime(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)} ms`;
  if (seconds < 90) return `${seconds.toFixed(1)} s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} minutes`;
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} hours`;
  if (seconds < 3.15e9) return `${(seconds / 86400).toFixed(1)} days`;
  return `${(seconds / 3.15e7).toExponential(1)} years`;
}

/* ========================================================= 7. heuristics --- */

export function LessonHeuristics(): JSX.Element {
  const [pocket, setPocket] = useState<PocketStats | null>(null);
  useEffect(() => { preparePocket().then(requestPocketStats).then(setPocket).catch(() => undefined); }, []);

  return (
    <LessonBody>
      <p>
        A search becomes tractable the moment it can say, with certainty, "this branch cannot
        possibly reach the goal within the moves I have left." The tool for that is a{' '}
        <strong>lower bound</strong> — a number you can compute quickly that is guaranteed never to
        be larger than the true remaining distance.
      </p>

      <Callout title="The trick, in one sentence">
        <p style={{ marginBottom: 0 }}>
          Throw away information about the cube until the simplified puzzle is small enough to solve
          <em> completely</em>, then use the exact answer to that easier puzzle as a lower bound
          for the real one. Forgetting detail can only ever make a puzzle easier, so the number can
          never be too big.
        </p>
      </Callout>

      <h3>An example you can hold in your head</h3>
      <p>
        Suppose you only track which way the twelve edges are facing and ignore absolutely
        everything else. That is 2<sup>11</sup> = 2,048 possible states — small enough to compute
        the exact distance from every one of them to "all edges oriented" by brute force. It turns
        out you are never more than 7 moves from having every edge the right way round.
      </p>
      <p>
        Now suppose the real cube in front of you needs 6 moves to orient its edges. Then it needs
        at least 6 moves to be solved, because solving it certainly orients the edges. If your
        search has only 4 moves left, it can abandon the entire branch without looking further.
      </p>

      <h3>Stacking them up</h3>
      <p>
        One such table is weak. Several of them, each forgetting different things, can be combined
        by taking whichever gives the largest bound — still a valid lower bound, and much sharper.
        The solver in this app keeps six: corner twist and slice, edge flip and slice, flip and
        twist, corner arrangement, and two overlapping groups of five edges tracked with both
        position and orientation. Together they occupy about 22 MB and are what makes a provably
        optimal answer possible at all.
      </p>

      {pocket ? (
        <Card title="A table you can see the whole of" className="stack">
          <p style={{ marginBottom: 0 }}>
            For the 2×2×2 the "simplified puzzle" can be the entire puzzle. All{' '}
            {pocket.states.toLocaleString('en-US')} of its positions were enumerated in your browser
            in {pocket.millis} ms, so its distance table is not a bound at all — it is the answer.
            Its diameter, computed here rather than quoted, is <strong>{pocket.godsNumber}</strong>.
          </p>
          <div className="row tight">
            {pocket.histogram.map((c, d) => (
              <span key={d} className="tag" title={`${c.toLocaleString('en-US')} positions`}>
                {d}: {formatApprox(c)}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Quiz
        id="heuristics-q1"
        question={<>A heuristic sometimes over-estimates the true remaining distance by one move. What happens?</>}
        options={[
          'Nothing — it is still safe, just slightly stronger',
          'The search may prune away the shortest solution and return a longer one',
          'The search becomes slower but stays correct',
          'It will crash',
        ]}
        correct={1}
        explain={
          <p style={{ marginBottom: 0 }}>
            Over-estimating is fatal to the optimality guarantee: the search discards a branch that
            actually contained the answer. A heuristic that never over-estimates is called{' '}
            <em>admissible</em>, and every bound this app uses is admissible by construction —
            each one is an exact distance in a genuinely simpler puzzle.
          </p>
        }
      />

      <CubeTask
        id="heuristics-t1"
        title="Orient the edges"
        brief={
          <p>
            This cube needs a handful of moves to get every edge facing the right way. Position
            does not matter — only orientation. Get the <em>edges oriented</em> counter to 12/12.
          </p>
        }
        setup="F R U' B L2 F'"
        check={(c) => {
          let flipped = 0;
          for (let i = 0; i < 12; i++) if (c.eo[i]) flipped++;
          return flipped === 0 ? null : `${flipped} edge${flipped === 1 ? ' is' : 's are'} still misoriented`;
        }}
        hint={<p style={{ margin: 0 }}>Only quarter turns of F and B change edge orientation. U, D, L, R and every half turn leave it alone, so you have a very small toolbox — which makes this searchable by hand.</p>}
      />
    </LessonBody>
  );
}

/* ------------------------------------------------------------- example --- */

export function exampleCube(scramble: string): string {
  return faceletString(toFacelets(CubieCube.fromMoves(parseSequence(scramble).moves)));
}

export { Cube3D, Sequence };
