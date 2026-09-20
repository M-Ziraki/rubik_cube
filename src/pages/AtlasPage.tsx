import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { StickerMap } from '../graph/StickerMap';
import { useStickerAnimation } from '../graph/useStickerAnimation';
import { Callout, Card, Sequence, Stat, formatBig } from '../components/ui';
import { actions, currentFacelets, getState, isSolved, useAppState } from '../state/store';
import { requestScramble, solve } from '../solver/client';
import {
  MAP_CIRCLES, faceletsAffectedBy, nodeForFacelet, siblingFacelets,
} from '../graph/stickerMap';
import { FACE_COLOR_NAMES, FACE_NAMES, MOVE_NAMES, GODS_NUMBER } from '../cube/defs';
import { describeMove } from '../cube/notation';
import { TOTAL_STATES } from '../data/facts';
import type { Solution } from '../solver/twophase';

export function AtlasPage(): JSX.Element {
  const state = useAppState((s) => s);
  const facelets = useMemo(() => currentFacelets(state), [state.origin, state.cursor, state.moves]);
  const solved = useMemo(() => isSolved(state), [facelets]);
  const anim = useStickerAnimation();

  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [previewMove, setPreviewMove] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showGhost, setShowGhost] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [solving, setSolving] = useState(false);
  const solveToken = useRef(0);

  // Play through whatever moves are queued ahead of the cursor.
  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => {
      const s = getState();
      if (s.cursor >= s.moves.length) { setPlaying(false); return; }
      actions.redo();
    }, Math.max(140, getState().turnSpeed + 90));
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => { setSolution(null); }, [state.origin]);

  const lastMove = state.cursor > 0 ? state.moves[state.cursor - 1] : null;
  const nextMove = state.cursor < state.moves.length ? state.moves[state.cursor] : null;
  const emphasised = useMemo(() => {
    const m = previewMove ?? (anim.progress < 1 ? anim.move : null);
    return m === null ? null : faceletsAffectedBy(m);
  }, [previewMove, anim.move, anim.progress]);

  const runSolve = async (): Promise<void> => {
    const token = ++solveToken.current;
    setSolving(true);
    try {
      const s = await solve(facelets, { timeBudgetMs: 10000, maxLength: GODS_NUMBER, goodEnough: GODS_NUMBER });
      if (token !== solveToken.current) return;
      setSolution(s);
      if (s.moves.length) { actions.queueMoves(s.moves); setPlaying(true); }
    } finally {
      if (token === solveToken.current) setSolving(false);
    }
  };

  const scramble = async (): Promise<void> => {
    setPlaying(false);
    const r = await requestScramble(22, false);
    actions.setPosition(r.facelets, r.moves);
    setSelected(null);
  };

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">The idea, made interactive</div>
        <h1>Fifty-four stickers, nine circles</h1>
        <p className="lede">
          On the left, a cube. On the right, the same cube drawn flat: every one of its 54 stickers
          is a dot, and the dots never move. Turning a face does not rearrange the map — it
          repaints it, because a turn carries stickers from one slot to another. Both pictures are
          drawn from one shared state, so they can never disagree.
        </p>
      </header>

      <div className="split" style={{ marginBottom: 18 }}>
        <Card
          title="The cube"
          note={solved ? 'Solved' : `${state.cursor} move${state.cursor === 1 ? '' : 's'} from the start position`}
        >
          <Cube3D
            onStickerPick={(f) => setSelected((cur) => (cur === f ? null : f))}
            onStickerHover={setHovered}
            emphasis={emphasised}
            selected={selected}
          />
          <p className="card-note" style={{ marginTop: 10, marginBottom: 0 }}>
            Drag a layer to turn it, drag the background to look around, click a sticker to find it
            on the map.
          </p>
        </Card>

        <Card
          title="The sticker map"
          note={
            anim.progress < 1 && anim.move !== null
              ? `turning ${MOVE_NAMES[anim.move]}`
              : previewMove !== null
                ? `${MOVE_NAMES[previewMove]} would move the highlighted dots`
                : '54 dots, nine per face'
          }
          actions={
            <div className="row tight">
              <button className="btn small ghost" aria-pressed={showLabels} onClick={() => setShowLabels((v) => !v)}>
                Labels
              </button>
              <button className="btn small ghost" aria-pressed={showGhost} onClick={() => setShowGhost((v) => !v)}>
                Before/after
              </button>
            </div>
          }
        >
          <div style={{ background: 'var(--map-paper)', borderRadius: 'var(--radius-s)', padding: 2 }}>
            <StickerMap
              facelets={anim.facelets}
              previousFacelets={anim.previousFacelets}
              animatingMove={anim.move}
              progress={anim.progress}
              highlightMove={previewMove}
              selected={selected}
              hovered={hovered}
              onSelect={(f) => setSelected((cur) => (cur === f ? null : f))}
              onHover={setHovered}
              showFaceLabels={showLabels}
              showGhost={showGhost}
            />
          </div>
          <p className="card-note" style={{ marginTop: 8, marginBottom: 0 }}>
            The nine thin circles are the cube's nine layers. A face turn slides the twelve dots on
            one circle a quarter of the way round it, and spins the nine dots of the face itself —
            the circle in play is drawn dark while it happens.
          </p>
        </Card>
      </div>

      <Card title="Controls" className="stack" style={{ marginBottom: 18 }}>
        <div className="row">
          <button className="btn" onClick={scramble}>Scramble</button>
          <button className="btn" onClick={() => { setPlaying(false); actions.resetToSolved(); setSelected(null); }}>
            Reset to solved
          </button>
          <button className="btn primary" onClick={runSolve} disabled={solving || solved || !state.tablesReady}>
            {solving ? 'Searching…' : 'Solve and play'}
          </button>
          <div className="spacer" />
          <button className="btn" onClick={() => actions.rewind()} title="back to the start position">⏮</button>
          <button className="btn" onClick={() => { setPlaying(false); actions.undo(); }} disabled={state.cursor === 0}>
            ◀ Step back
          </button>
          <button className="btn" onClick={() => setPlaying((p) => !p)} disabled={state.cursor >= state.moves.length}>
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button className="btn" onClick={() => { setPlaying(false); actions.redo(); }} disabled={state.cursor >= state.moves.length}>
            Step forward ▶
          </button>
        </div>

        <div className="row" style={{ gap: 20, alignItems: 'center' }}>
          <label className="field" style={{ minWidth: 220, flex: '0 1 320px' }}>
            Turn speed: {state.turnSpeed} ms
            <input
              type="range" min={60} max={900} step={20} value={state.turnSpeed}
              onChange={(e) => actions.setTurnSpeed(Number(e.target.value))}
            />
          </label>
          <Stat
            value={lastMove === null ? '—' : MOVE_NAMES[lastMove]}
            label="last move"
            sub={lastMove === null ? 'nothing played yet' : describeMove(lastMove)}
          />
          <Stat
            value={nextMove === null ? '—' : MOVE_NAMES[nextMove]}
            label="next move"
            sub={`${state.cursor} of ${state.moves.length} played`}
          />
        </div>

        <div>
          <div className="card-note" style={{ marginBottom: 4 }}>
            Move list — click to jump, hover a turn below to preview what it touches
          </div>
          <Sequence moves={state.moves} cursor={state.cursor} onSeek={(i) => { setPlaying(false); actions.seek(i); }} empty="turn a face, or scramble" />
        </div>

        <div>
          <div className="card-note" style={{ marginBottom: 6 }}>
            Turn a face by hand. Hovering a button highlights the twenty stickers it moves, on both
            pictures at once.
          </div>
          <div
            onMouseLeave={() => setPreviewMove(null)}
            onFocus={() => undefined}
          >
            <PreviewMovePad onPreview={setPreviewMove} onMove={(m) => { setPlaying(false); actions.applyMove(m); }} />
          </div>
        </div>

        {solution ? (
          <Callout title={`A solution in ${solution.length} moves`}>
            <p style={{ marginBottom: 6 }}>
              Queued up and playing. Use step back and forward to walk through it one turn at a
              time and watch each sticker travel.
            </p>
            <Sequence moves={solution.moves} />
          </Callout>
        ) : null}
      </Card>

      <div className="split" style={{ marginBottom: 18 }}>
        <StickerInspector facelet={selected ?? hovered} isSelection={selected !== null} />
        <Card title="Reading the map">
          <div className="prose">
            <p>
              Each dot is one sticker. The nine dots of a face sit where two families of circles
              cross, which is why a face reads as a curved 3×3 grid rather than a square one.
            </p>
            <ul style={{ marginBottom: 8 }}>
              <li><strong>Solved</strong> means six clean blocks of one colour.</li>
              <li><strong>A quarter turn</strong> moves twenty stickers: eight on the face itself, twelve around its edge.</li>
              <li><strong>The centres never move</strong> — six dots keep their colour no matter what you do. Find them by turning a few faces and watching what stays put.</li>
            </ul>
            <p style={{ marginBottom: 0 }}>
              This map is <em>not</em> the graph of cube configurations. That is a different object
              with 43 quintillion vertices, and it lives in the{' '}
              <a href="#/graph">State space</a> laboratory. Here there are exactly 54 dots, one per
              sticker, for every one of those {formatBig(TOTAL_STATES)} configurations.
            </p>
          </div>
        </Card>
      </div>

      <Card title="Where this fits">
        <div className="prose">
          <p>
            The rest of the application builds on this picture. The{' '}
            <a href="#/course">Course</a> works up from notation to how God's number was proved;{' '}
            <a href="#/graph">State space</a> draws the other graph, the one whose vertices are
            whole configurations; <a href="#/solver">Solvers</a> finds short solutions and is
            careful about what it can prove; <a href="#/scan">Your cube</a> takes the colours off
            the cube on your desk; and <a href="#/training">Training</a> grades your own solutions
            against the true optimum.
          </p>
        </div>
      </Card>
    </>
  );
}

/** A move pad that reports hover, so a turn can be previewed before it is made. */
function PreviewMovePad({ onPreview, onMove }: {
  onPreview: (m: number | null) => void; onMove: (m: number) => void;
}): JSX.Element {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
      {[0, 1, 2, 3, 4, 5].map((face) => (
        <div key={face} style={{ display: 'grid', gap: 4 }}>
          <div className="card-note" style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>
            {FACE_NAMES[face]}
          </div>
          {[0, 1, 2].map((p) => {
            const move = face * 3 + p;
            return (
              <button
                key={move}
                type="button"
                className="move-chip"
                style={{ width: '100%' }}
                title={describeMove(move)}
                onMouseEnter={() => onPreview(move)}
                onFocus={() => onPreview(move)}
                onBlur={() => onPreview(null)}
                onClick={() => onMove(move)}
              >
                {MOVE_NAMES[move]}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Explains whichever sticker is under the pointer or selected. */
function StickerInspector({ facelet, isSelection }: { facelet: number | null; isSelection: boolean }): JSX.Element {
  const state = useAppState((s) => s);
  const facelets = useMemo(() => currentFacelets(state), [state.origin, state.cursor, state.moves]);

  if (facelet === null) {
    return (
      <Card title="Sticker inspector" note="nothing picked">
        <p className="card-note" style={{ margin: 0 }}>
          Point at a dot on the map, or at a sticker on the cube, and the same sticker lights up in
          both. Click to pin it, and it stays lit while you turn faces — a good way to watch one
          sticker travel.
        </p>
      </Card>
    );
  }

  const node = nodeForFacelet(facelet);
  const face = FACE_NAMES[node.face];
  const slot = (facelet % 9) + 1;
  const siblings = siblingFacelets(facelet);
  const piece = siblings.length === 2 ? 'corner' : siblings.length === 1 ? 'edge' : 'centre';
  const colour = facelets[facelet] as keyof typeof FACE_COLOR_NAMES;
  const movesTouching: string[] = [];
  for (let m = 0; m < 18; m += 3) {
    if (faceletsAffectedBy(m).includes(facelet)) movesTouching.push(FACE_NAMES[m / 3]);
  }
  const circles = node.circles.map((c) => MAP_CIRCLES[c]);

  return (
    <Card title="Sticker inspector" note={isSelection ? 'pinned — click again to release' : 'following the pointer'}>
      <div className="row" style={{ gap: 18, marginBottom: 12 }}>
        <Stat value={`${face}${slot}`} label="slot" sub={`a ${piece} sticker on the ${face} face`} />
        <Stat
          value={(
            <span style={{
              display: 'inline-block', width: 26, height: 26, borderRadius: 6,
              background: `var(--${colour.toLowerCase()})`,
              border: '1px solid var(--line-strong)', verticalAlign: 'middle',
            }} />
          )}
          label="colour now"
          sub={FACE_COLOR_NAMES[colour]}
        />
        <Stat
          value={movesTouching.join(' ') || 'none'}
          label="moved by"
          sub={piece === 'centre' ? 'a centre can never move' : 'these face turns'}
        />
      </div>
      <p className="card-note" style={{ marginBottom: siblings.length ? 6 : 0 }}>
        On the map this dot sits where two circles cross: layer {circles[0].layer} of the{' '}
        {circles[0].family.id} family and layer {circles[1].layer} of the {circles[1].family.id}{' '}
        family. That pair of layers is the sticker's address on the cube.
      </p>
      {siblings.length ? (
        <p className="card-note" style={{ margin: 0 }}>
          It shares a {piece} with{' '}
          {siblings.map((s2) => `${FACE_NAMES[Math.floor(s2 / 9)]}${(s2 % 9) + 1}`).join(' and ')} —
          highlighted as well, because those stickers are stuck to the same piece of plastic and
          always travel together.
        </p>
      ) : (
        <p className="card-note" style={{ margin: 0 }}>
          This is a centre: the one sticker on its face that no sequence of turns can move, which
          is why the six centres define the colour scheme.
        </p>
      )}
    </Card>
  );
}