import { useMemo, useState } from 'react';
import { CubeTask, LessonBody, NumberQuiz, Quiz, TryOnTheCube } from './framework';
import { Callout, Card, Sequence, Stat } from '../components/ui';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets, diagnose, parseFaceletString } from '../cube/facelet';
import { CORNER_NAMES, EDGE_NAMES, FACE_COLOR_NAMES, FACE_NAMES, MOVE_NAMES, SOLVED_FACELETS } from '../cube/defs';
import { describeMove, formatSequence, parseSequence, simplifySequence } from '../cube/notation';
import { report } from '../cube/analysis';

/* ============================================================ 1. notation --- */

export function LessonNotation(): JSX.Element {
  const [moves, setMoves] = useState<number[]>([]);
  const cube = useMemo(() => CubieCube.fromMoves(moves), [moves]);
  const simplified = useMemo(() => simplifySequence(moves), [moves]);

  return (
    <LessonBody>
      <p>
        Everything in this application — every lesson, every solver, every graph — is written in
        one small language. Six letters and three endings. It is worth twenty minutes to make it
        automatic, because after that you never think about it again.
      </p>

      <h3>The six faces</h3>
      <p>
        Hold the cube still. Do not turn the whole thing. The face nearest you is <code>F</code>ront,
        the one away from you is <code>B</code>ack, and the other four are <code>U</code>p,{' '}
        <code>D</code>own, <code>L</code>eft and <code>R</code>ight. Those names belong to
        <em> positions in space</em>, not to colours. If you rotate the cube in your hands, the
        front face changes; the colours do not.
      </p>
      <div className="row tight">
        {FACE_NAMES.map((f) => (
          <span key={f} className="tag">
            <code>{f}</code> {FACE_COLOR_NAMES[f]}
          </span>
        ))}
      </div>

      <h3>The three endings</h3>
      <ul>
        <li><code>R</code> — turn that face a quarter turn <strong>clockwise</strong>, looking straight at it.</li>
        <li><code>R&rsquo;</code> — a quarter turn <strong>anticlockwise</strong>. Said out loud: "R prime".</li>
        <li><code>R2</code> — a half turn. Direction does not matter; you land in the same place either way.</li>
      </ul>
      <Callout title="Why R2 counts as one move">
        <p style={{ marginBottom: 0 }}>
          This is the <strong>face-turn metric</strong>, and it is the metric in which God's number
          is 20. Count half turns as two instead and the answer becomes 26. Neither is more correct
          — but a claim about move counts is meaningless until you say which one you mean.
        </p>
      </Callout>

      <Card title="Play with it" className="stack">
        <div className="split" style={{ gap: 14 }}>
          <Cube3D facelets={faceletString(toFacelets(cube))} interactive={false} height={260} />
          <div className="stack">
            <MovePad onMove={(m) => setMoves((x) => [...x, m])} keyboard={false} />
            <div className="row tight">
              <button className="btn small" onClick={() => setMoves((x) => x.slice(0, -1))} disabled={!moves.length}>Undo</button>
              <button className="btn small ghost" onClick={() => setMoves([])}>Reset</button>
            </div>
            <Sequence moves={moves} empty="press a button" />
            {moves.length !== simplified.length ? (
              <div className="card-note">
                Those {moves.length} moves are really only {simplified.length}:{' '}
                <code>{formatSequence(simplified) || 'nothing at all'}</code>
              </div>
            ) : null}
            {moves.length ? <div className="card-note">{describeMove(moves[moves.length - 1])}</div> : null}
          </div>
        </div>
      </Card>

      <h3>Sequences cancel</h3>
      <p>
        <TryOnTheCube sequence="R R'" /> does nothing at all. <TryOnTheCube sequence="R R" /> is
        the same as <code>R2</code>. <TryOnTheCube sequence="U D U'" /> is just <code>D</code>,
        because <code>U</code> and <code>D</code> turn opposite faces and never interfere. Spotting
        these cancellations is the first, cheapest kind of efficiency there is — and the solvers in
        this app do it automatically on every answer they produce.
      </p>

      <Quiz
        id="notation-q1"
        question={<>Which of these sequences leaves the cube exactly as it started?</>}
        options={["R U R' U'", "F B' F' B", "L2 R2 L2 R2", "U R U' R'"]}
        correct={2}
        explain={
          <p style={{ marginBottom: 0 }}>
            <code>L</code> and <code>R</code> are opposite faces, so they commute:{' '}
            <code>L2 R2 L2 R2</code> = <code>L2 L2 R2 R2</code> = nothing. The others are all
            genuine four-move sequences — <code>R U R&rsquo; U&rsquo;</code> famously has to be
            repeated six times before the cube comes home.
          </p>
        }
      />

      <CubeTask
        id="notation-t1"
        title="Undo it"
        brief={<p>The cube below has had <code>R U F&rsquo;</code> applied to it. Put it back.</p>}
        setup="R U F'"
        parMoves={3}
        check={(c) => (c.isSolved() ? null : 'not solved yet')}
        hint={<p style={{ margin: 0 }}>Reverse the order and flip every direction: the inverse of <code>A B C</code> is <code>C&rsquo; B&rsquo; A&rsquo;</code>.</p>}
        solution="F U' R'"
      />
    </LessonBody>
  );
}

/* ============================================================== 2. pieces --- */

export function LessonPieces(): JSX.Element {
  const [moves, setMoves] = useState<number[]>([]);
  const cube = useMemo(() => CubieCube.fromMoves(moves), [moves]);
  const r = useMemo(() => report(cube), [cube]);

  return (
    <LessonBody>
      <p>
        A cube has 54 stickers, and thinking about stickers is the single biggest obstacle to
        getting better at this puzzle. There are only <strong>20 moving pieces</strong>, and every
        one of them carries its stickers around as a unit. A corner with white, green and orange on
        it will have white, green and orange on it forever.
      </p>

      <div className="grid three">
        <Card title="8 corners"><p style={{ marginBottom: 0 }}>Three stickers each. Can sit in 8 places and be twisted 3 ways.</p></Card>
        <Card title="12 edges"><p style={{ marginBottom: 0 }}>Two stickers each. Can sit in 12 places and be flipped 2 ways.</p></Card>
        <Card title="6 centres"><p style={{ marginBottom: 0 }}>One sticker each, and they never move relative to each other. They <em>are</em> the colour scheme.</p></Card>
      </div>

      <Callout title="Centres do not move">
        <p style={{ marginBottom: 0 }}>
          Turn a face and its centre spins in place, but white is always opposite yellow, green
          always opposite blue, orange always opposite red. This is why the app refuses to let you
          repaint a centre when you enter your own cube: doing so would describe a cube that cannot
          exist.
        </p>
      </Callout>

      <h3>Position and orientation are different things</h3>
      <p>
        A piece can be in exactly the right place and still be wrong, because it is facing the
        wrong way. Solvers keep these two ideas rigidly apart, and so should you — the two-phase
        algorithm's entire first act is about <em>orientation only</em>, ignoring position
        completely.
      </p>

      <Card title="Watch the two quantities separately" className="stack">
        <div className="split" style={{ gap: 14 }}>
          <Cube3D facelets={faceletString(toFacelets(cube))} interactive={false} height={260} />
          <div className="stack">
            <MovePad onMove={(m) => setMoves((x) => [...x, m])} keyboard={false} />
            <div className="row tight">
              <button className="btn small" onClick={() => setMoves((x) => x.slice(0, -1))} disabled={!moves.length}>Undo</button>
              <button className="btn small ghost" onClick={() => setMoves([])}>Reset</button>
            </div>
            <div className="row" style={{ gap: 16 }}>
              <Stat value={`${r.orientedEdges}/12`} label="edges oriented" />
              <Stat value={`${r.orientedCorners}/8`} label="corners oriented" />
              <Stat value={`${r.solvedPieces}/20`} label="fully home" />
            </div>
            <div className="card-note">
              Notice that <code>U</code>, <code>D</code> and any half turn never change either
              orientation count. Only quarter turns of <code>F</code>, <code>B</code>,{' '}
              <code>L</code> and <code>R</code> flip edges; only quarter turns of{' '}
              <code>L</code>, <code>R</code>, <code>F</code> and <code>B</code> twist corners.
            </div>
          </div>
        </div>
      </Card>

      <h3>Naming the pieces</h3>
      <p>
        A piece is named by the faces it touches when it is home. The corner between Up, Right and
        Front is <code>URF</code>; the edge between Up and Front is <code>UF</code>. That gives
        eight corner names and twelve edge names, and those twenty names are the vocabulary every
        serious discussion of the cube uses.
      </p>
      <div className="row tight">
        {CORNER_NAMES.map((n) => <span key={n} className="tag">{n}</span>)}
      </div>
      <div className="row tight">
        {EDGE_NAMES.map((n) => <span key={n} className="tag">{n}</span>)}
      </div>

      <Quiz
        id="pieces-q1"
        question={<>A cube has every piece in its correct position, but three corners are twisted. How many pieces are "solved"?</>}
        options={['20 — everything is in place', '17 — the three twisted corners do not count', '3', 'It depends which corners']}
        correct={1}
        explain={
          <p style={{ marginBottom: 0 }}>
            A piece is solved only when it is both in the right place <em>and</em> the right way
            round. Position and orientation are independent, and a solver has to fix both.
          </p>
        }
      />
    </LessonBody>
  );
}

/* =============================================================== 3. laws --- */

export function LessonLaws(): JSX.Element {
  const [broken, setBroken] = useState<'none' | 'twist' | 'flip' | 'swap'>('none');

  const facelets = useMemo(() => {
    const c = CubieCube.identity();
    c.applyMoves(parseSequence("R U R' F' U2 L D").moves);
    if (broken === 'twist') c.co[0] = (c.co[0] + 1) % 3;
    if (broken === 'flip') c.eo[0] ^= 1;
    if (broken === 'swap') { const t = c.ep[0]; c.ep[0] = c.ep[1]; c.ep[1] = t; }
    return toFacelets(c);
  }, [broken]);

  const check = useMemo(() => diagnose(facelets), [facelets]);

  return (
    <LessonBody>
      <p>
        Take a cube apart and put it back together at random and you will almost certainly build a
        puzzle that cannot be solved. Of the ways to arrange the pieces, only{' '}
        <strong>one in twelve</strong> is reachable by turning faces. Three separate conservation
        laws are responsible, and each one costs you a factor.
      </p>

      <h3>Law 1 — total corner twist is a multiple of three</h3>
      <p>
        Give each corner a number: 0 if its white-or-yellow sticker faces up or down, 1 if you have
        to rotate it one step clockwise to get there, 2 for two steps. Add all eight numbers. Every
        single face turn leaves that total unchanged modulo 3. So a cube with exactly one corner
        twisted is unreachable — a factor of 3 lost.
      </p>

      <h3>Law 2 — an even number of edges are flipped</h3>
      <p>
        The same argument with two states instead of three. Face turns always flip edges in pairs,
        so the total number of flipped edges is always even. One flipped edge alone is impossible —
        a factor of 2 lost.
      </p>

      <h3>Law 3 — corner and edge permutations have matching parity</h3>
      <p>
        Every quarter turn cycles four corners and four edges. A 4-cycle is an <em>odd</em>
        permutation, so each turn flips the parity of both the corner arrangement and the edge
        arrangement at the same time. They can never disagree. Swapping just two pieces and leaving
        everything else alone is therefore impossible — a final factor of 2 lost.
      </p>

      <Card title="Break a law and watch the validator catch it" className="stack">
        <div className="row tight">
          {([
            ['none', 'A legal cube'],
            ['twist', 'Twist one corner'],
            ['flip', 'Flip one edge'],
            ['swap', 'Swap two edges'],
          ] as const).map(([k, label]) => (
            <button key={k} className="btn small" aria-pressed={broken === k}
              style={broken === k ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
              onClick={() => setBroken(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="split" style={{ gap: 14 }}>
          <Cube3D facelets={faceletString(facelets)} interactive={false} height={240} />
          <div className="stack">
            {check.ok ? (
              <Callout title="Reachable"><p style={{ margin: 0 }}>All three laws hold. Some sequence of turns produces this position.</p></Callout>
            ) : (
              check.problems.map((p) => (
                <Callout key={p.code} kind="warn" title={p.message}>
                  {p.detail.length ? <ul style={{ margin: 0 }}>{p.detail.map((d, i) => <li key={i}>{d}</li>)}</ul> : null}
                </Callout>
              ))
            )}
            <div className="card-note">
              The same check runs on <a href="#/scan">your own cube</a>. If it complains there, you
              have either mis-read a sticker or genuinely have an illegally assembled cube.
            </div>
          </div>
        </div>
      </Card>

      <NumberQuiz
        id="laws-q1"
        question={
          <p style={{ marginBottom: 0 }}>
            Arranging the 20 pieces freely gives 8!·3<sup>8</sup>·12!·2<sup>12</sup> = 519,024,039,293,878,272,000
            configurations. The three laws cut this by 3 × 2 × 2 = 12. How many positions are
            actually reachable?
          </p>
        }
        answer={43252003274489856000n}
        explain={
          <p style={{ marginBottom: 0 }}>
            519,024,039,293,878,272,000 ÷ 12 = 43,252,003,274,489,856,000. This is the number in
            the video, and now you know exactly where the 12 comes from.
          </p>
        }
      />
    </LessonBody>
  );
}

/* ---------------------------------------------------------------- shared --- */

export const SOLVED = parseFaceletString(SOLVED_FACELETS);
export const ALL_MOVE_NAMES = MOVE_NAMES;
