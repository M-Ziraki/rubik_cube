import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { ColorGrid, ColorPalette } from '../scan/ColorGrid';
import { Callout, Card, Sequence, Stat } from '../components/ui';
import { actions, useAppState } from '../state/store';
import { diagnose, faceletString, parseFaceletString, toFacelets } from '../cube/facelet';
import { FACE_COLOR_NAMES, FACE_NAMES, MOVE_NAMES, SOLVED_FACELETS } from '../cube/defs';
import { describeMove } from '../cube/notation';
import { explainMoves, requestScramble, solve } from '../solver/client';
import type { SolutionNarrative } from '../cube/analysis';
import type { Solution } from '../solver/twophase';
import { METHODS } from '../data/methods';

export function ScanPage(): JSX.Element {
  const tablesReady = useAppState((s) => s.tablesReady);
  const [grid, setGrid] = useState<Uint8Array>(() => parseFaceletString(SOLVED_FACELETS));
  const [brush, setBrush] = useState(0);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [narrative, setNarrative] = useState<SolutionNarrative | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<string | null>(null);
  const token = useRef(0);

  const check = useMemo(() => diagnose(grid), [grid]);

  const paint = (index: number, face: number): void => {
    setGrid((g) => { const next = Uint8Array.from(g); next[index] = face; return next; });
    setSolution(null); setNarrative(null); setAccepted(null);
  };

  const loadRandom = async (): Promise<void> => {
    const r = await requestScramble(25, true);
    setGrid(parseFaceletString(r.facelets));
    setSolution(null); setNarrative(null); setAccepted(null);
  };

  const clearToSolved = (): void => {
    setGrid(parseFaceletString(SOLVED_FACELETS));
    setSolution(null); setNarrative(null); setAccepted(null);
  };

  const buildAndSolve = async (): Promise<void> => {
    if (!check.ok || !check.cube) return;
    const facelets = faceletString(toFacelets(check.cube));
    setAccepted(facelets);
    actions.setPosition(facelets, []);
    const t = ++token.current;
    setBusy(true); setSolution(null); setNarrative(null);
    try {
      const s = await solve(facelets, {
        timeBudgetMs: 10000,
        maxLength: 20,
        onImprove: (partial) => { if (t === token.current) setSolution(partial); },
      });
      if (t !== token.current) return;
      setSolution(s);
      if (s.moves.length) setNarrative(await explainMoves(facelets, s.moves));
    } finally {
      if (t === token.current) setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const c = new Array(6).fill(0);
    for (let i = 0; i < 54; i++) c[grid[i]]++;
    return c;
  }, [grid]);

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Practice</div>
        <h1>Your cube, in this cube</h1>
        <p className="lede">
          Type in the colours of the cube on your desk. The app will check that what you have
          entered is physically possible, rebuild it in 3D, and walk you through a solution of
          twenty moves or fewer — explaining at every step what the move is for.
        </p>
      </header>

      <div className="split">
        <div className="stack">
          <Card
            title="Enter the colours"
            note="Pick a colour, then click stickers. Centres are fixed — they define the scheme."
            actions={
              <div className="row tight">
                <button className="btn small ghost" onClick={clearToSolved}>Clear</button>
                <button className="btn small ghost" onClick={loadRandom}>Fill with a random cube</button>
              </div>
            }
          >
            <div className="stack">
              <ColorPalette value={brush} onChange={setBrush} />
              <div className="card-note">
                Painting with <strong>{FACE_COLOR_NAMES[FACE_NAMES[brush]]}</strong> — the colour of
                the <code>{FACE_NAMES[brush]}</code> centre.
              </div>
              <div className="scroll-x">
                <ColorGrid facelets={grid} brush={brush} onPaint={paint} />
              </div>
              <div className="row tight">
                {FACE_NAMES.map((f, i) => (
                  <span key={f} className={`tag ${counts[i] === 9 ? 'ok' : 'danger'}`}>
                    {FACE_COLOR_NAMES[f]} {counts[i]}/9
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <Card title="How to read your physical cube">
            <div className="prose">
              <p>
                Hold the cube with <strong>white on top</strong> and <strong>green facing you</strong>.
                That fixes the scheme this app uses: white U, orange R, green F, yellow D, red L,
                blue B. If your cube uses a different scheme, just keep the centres consistent —
                what matters is that each centre keeps its own colour.
              </p>
              <p style={{ marginBottom: 0 }}>
                Fill in the top face first, then turn the cube so each side face comes towards you
                in turn — left, front, right, back — and finally the bottom. The net on the left is
                laid out the same way an unfolded cardboard cube would be.
              </p>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Validation" note="the three laws every real cube obeys">
            {check.ok ? (
              <>
                <div className="row" style={{ marginBottom: 10 }}>
                  <span className="tag ok">this is a real, reachable cube</span>
                </div>
                <p className="card-note">
                  Corner twists sum to a multiple of three, an even number of edges are flipped, and
                  the corner and edge permutations have the same parity. Every legal turn preserves
                  all three, which is why only one arrangement in twelve is actually reachable.
                </p>
                <button className="btn primary" onClick={buildAndSolve} disabled={busy || !tablesReady}>
                  {busy ? 'Solving…' : 'Rebuild and solve'}
                </button>
              </>
            ) : (
              <div className="stack">
                {check.problems.map((p) => (
                  <Callout key={p.code} kind={p.code === 'parity' || p.code === 'twist' || p.code === 'flip' ? 'warn' : 'danger'} title={p.message}>
                    {p.detail.length ? (
                      <ul style={{ margin: 0 }}>
                        {p.detail.slice(0, 6).map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    ) : null}
                  </Callout>
                ))}
                <p className="card-note" style={{ margin: 0 }}>
                  A mis-typed sticker and a genuinely impossible cube look the same from here. Check
                  your reading first — but if the cube really is in this state, someone has taken it
                  apart and reassembled it wrongly, and no amount of turning will fix it.
                </p>
              </div>
            )}
          </Card>

          <Card title="Reconstruction">
            {accepted ? (
              <Cube3D />
            ) : (
              <Cube3D facelets={check.ok && check.cube ? faceletString(toFacelets(check.cube)) : SOLVED_FACELETS} interactive={false} />
            )}
            {accepted ? (
              <p className="card-note" style={{ marginTop: 8, marginBottom: 0 }}>
                This is now the live cube throughout the app. Step through the solution below and
                watch it move.
              </p>
            ) : null}
          </Card>

          {solution ? (
            <GuidedSolve solution={solution} narrative={narrative} busy={busy} />
          ) : null}
        </div>
      </div>

      <MethodComparison />
    </>
  );
}

function GuidedSolve({ solution, narrative, busy }: {
  solution: Solution; narrative: SolutionNarrative | null; busy: boolean;
}): JSX.Element {
  const steps = narrative?.steps ?? [];
  const boundary = narrative?.phaseBoundary ?? -1;
  const cursor = useAppState((s) => s.cursor);
  const moves = useAppState((s) => s.moves);

  // The search keeps improving while it runs, so replace the queued route each
  // time it finds a shorter one - but only while the user has not started
  // stepping through it, which would pull the cube out from under them.
  useEffect(() => {
    if (cursor === 0 && solution.moves.length) actions.queueMoves(solution.moves);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solution.moves.join(',')]);

  const step = steps[cursor];

  return (
    <Card
      title="Guided solve"
      note={`${solution.length} moves${busy ? ' — still looking for something shorter' : ''}`}
      actions={
        <div className="row tight">
          <button className="btn small" onClick={() => actions.rewind()}>⏮</button>
          <button className="btn small" onClick={() => actions.undo()} disabled={cursor === 0}>Back</button>
          <button className="btn primary small" onClick={() => actions.redo()} disabled={cursor >= moves.length}>Next move</button>
        </div>
      }
    >
      <div className="stack">
        <Sequence moves={moves} cursor={cursor} onSeek={(i) => actions.seek(i)} />

        {step ? (
          <div className="callout">
            <h4>Move {cursor + 1} of {moves.length}: {MOVE_NAMES[step.move]}</h4>
            <p style={{ marginBottom: 6 }}>{describeMove(step.move)}</p>
            <p style={{ marginBottom: 0 }}>
              <strong>Why:</strong> it {step.effects.join(', ')}.
            </p>
          </div>
        ) : cursor >= moves.length && moves.length > 0 ? (
          <Callout title="Solved">
            <p style={{ margin: 0 }}>That is the cube back at the centre of the graph. Check your physical cube against the model above.</p>
          </Callout>
        ) : null}

        {step ? (
          <div className="row" style={{ gap: 18 }}>
            <Stat value={`${step.after.orientedEdges}/12`} label="edges oriented" />
            <Stat value={`${step.after.orientedCorners}/8`} label="corners oriented" />
            <Stat value={`${step.after.sliceEdgesHome}/4`} label="slice edges home" />
            <Stat value={`${step.after.solvedPieces}/20`} label="pieces finished" />
          </div>
        ) : null}

        {boundary > 0 && boundary < steps.length ? (
          <p className="card-note" style={{ margin: 0 }}>
            The first {boundary} moves are phase one: they finish almost nothing, they just remove
            every misorientation and put the middle-slice edges back in the middle slice. The
            remaining {steps.length - boundary === 1 ? 'move is' : `${steps.length - boundary} are`}{' '}
            phase two, which only rearranges. That is why a
            computed solution looks like nothing is happening and then everything happens at once —
            the opposite of a human method, where the cube visibly fills in layer by layer.
          </p>
        ) : steps.length ? (
          <p className="card-note" style={{ margin: 0 }}>
            This particular route does not split into the usual two phases. The solver searches the
            cube from six viewpoints — three axes, each forwards and inverted — and this answer came
            from one of the others, so its structure is a rotated or reversed copy of the two-phase
            shape rather than the one these counters track. It is still a verified solution of{' '}
            {steps.length} moves.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function MethodComparison(): JSX.Element {
  const max = Math.max(...METHODS.map((m) => m.typicalMoves));
  return (
    <Card title="What you are giving up, and what you are getting" className="stack">
      <p className="prose">
        A twenty-move solution is not a better version of a human method. It is a different kind of
        object: found by a machine searching millions of positions, unmemorable, and unrelated to
        anything you could work out at the table. Here is the honest trade-off.
      </p>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr><th>method</th><th className="num">typical moves</th><th>what you memorise</th><th>how it works</th><th>why it is not optimal</th></tr>
          </thead>
          <tbody>
            {METHODS.map((m) => (
              <tr key={m.name}>
                <td>
                  <strong>{m.name}</strong>
                  <div><span className={`tag ${m.kind === 'machine' ? 'solid' : m.kind === 'hybrid' ? 'warn' : ''}`}>{m.kind}</span></div>
                </td>
                <td className="num">
                  {m.typicalMoves}
                  <div className="meter" style={{ width: 60, marginTop: 4 }}>
                    <i style={{ width: `${(m.typicalMoves / max) * 100}%` }} />
                  </div>
                </td>
                <td>{m.algorithmsToLearn}</td>
                <td>{m.howItWorks}</td>
                <td>{m.whyNotOptimal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
