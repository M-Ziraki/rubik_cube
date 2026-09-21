import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { Transport } from '../components/Transport';
import { StickerMap } from '../graph/StickerMap';
import { useStickerAnimation } from '../graph/useStickerAnimation';
import { Callout, Card, Sequence, Stat, formatBig } from '../components/ui';
import { actions, currentFacelets, isSolved, useAppState } from '../state/store';
import { player } from '../state/player';
import { requestScramble, solve } from '../solver/client';
import {
  MAP_CIRCLES, faceletsAffectedBy, nodeForFacelet, siblingFacelets,
} from '../graph/stickerGeometry';
import { FACE_COLOR_NAMES, FACE_NAMES, MOVE_NAMES, GODS_NUMBER } from '../cube/defs';
import { describeMove } from '../cube/notation';
import { TOTAL_STATES } from '../data/facts';
import { useI18n } from '../i18n/I18nProvider';
import type { Solution } from '../solver/twophase';

export function AtlasPage(): JSX.Element {
  const { t } = useI18n();
  const state = useAppState((s) => s);
  const facelets = useMemo(
    () => currentFacelets(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.origin, state.cursor, state.moves],
  );
  const solved = useMemo(() => isSolved(state), [facelets]); // eslint-disable-line react-hooks/exhaustive-deps
  const anim = useStickerAnimation();

  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [previewMove, setPreviewMove] = useState<number | null>(null);
  const [showGhost, setShowGhost] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [solving, setSolving] = useState(false);
  const [solveError, setSolveError] = useState<string | null>(null);
  const [yielded, setYielded] = useState(false);
  const solveToken = useRef(0);

  // A new starting position invalidates any solution we were showing.
  useEffect(() => { setSolution(null); }, [state.origin]);

  /**
   * The preview highlight is a hover affordance, and hover affordances go stale:
   * a click moves focus, a re-render replaces the button, a touch never sends a
   * matching leave event. Left stale, the emphasis set stays applied and every
   * sticker outside it is drawn faded - which is the "stickers lost their
   * colour" report. So the highlight is cleared by anything that ends the hover,
   * including the click itself, and unconditionally whenever the position moves.
   */
  const clearPreview = useCallback(() => setPreviewMove(null), []);
  useEffect(clearPreview, [state.cursor, state.moves, state.origin, clearPreview]);

  const emphasised = useMemo(() => {
    const m = previewMove ?? (anim.progress < 1 ? anim.move : null);
    return m === null ? null : faceletsAffectedBy(m);
  }, [previewMove, anim.move, anim.progress]);

  const runSolve = async (): Promise<void> => {
    const token = ++solveToken.current;
    setSolving(true);
    setSolveError(null);
    player.stop();
    try {
      const target = currentFacelets();
      const s = await solve(target, {
        timeBudgetMs: 10000, maxLength: GODS_NUMBER, goodEnough: GODS_NUMBER,
      });
      if (token !== solveToken.current) return;
      // The cube may have been turned while the worker was thinking; a solution
      // for a position we have left is worse than none at all.
      if (currentFacelets() !== target) return;
      setSolution(s);
      if (s.moves.length) actions.queueMoves(s.moves);
    } catch (err) {
      // A worker that dies takes the search with it; say so rather than
      // leaving the button spinning and the console carrying the news.
      if (token === solveToken.current) setSolveError((err as Error).message);
    } finally {
      if (token === solveToken.current) setSolving(false);
    }
  };

  const scramble = async (): Promise<void> => {
    player.yieldToUser();
    solveToken.current++;
    setSolving(false);
    const r = await requestScramble(22, false);
    actions.setPosition(r.facelets, r.moves);
    setSelected(null);
    clearPreview();
  };

  const manualMove = (m: number): void => {
    // A hand-turn during playback stops the player rather than racing it.
    const wasPlaying = player.isActive();
    player.yieldToUser();
    setYielded(wasPlaying);
    solveToken.current++;
    actions.applyMove(m);
    clearPreview();
  };

  const mapNote = anim.progress < 1 && anim.move !== null
    ? t('atlas.map.turning', { move: MOVE_NAMES[anim.move] })
    : previewMove !== null
      ? t('atlas.map.preview', { move: MOVE_NAMES[previewMove] })
      : t('atlas.map.idle');

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">{t('atlas.eyebrow')}</div>
        <h1>{t('atlas.title')}</h1>
        <p className="lede">{t('atlas.lede')}</p>
      </header>

      <div className="split" style={{ marginBottom: 18 }}>
        <Card
          title={t('atlas.cube')}
          note={solved ? t('common.solved') : t('atlas.cube.movesFromStart', { n: state.cursor })}
        >
          <Cube3D
            onStickerPick={(f) => setSelected((cur) => (cur === f ? null : f))}
            onStickerHover={setHovered}
            onUserMove={manualMove}
            emphasis={emphasised}
            selected={selected}
          />
          <p className="card-note" style={{ marginTop: 10, marginBottom: 0 }}>
            {t('atlas.cube.hint')}
          </p>
        </Card>

        <Card
          title={t('atlas.map')}
          note={mapNote}
          actions={(
            <div className="row tight">
              <button
                className="btn small ghost"
                aria-pressed={showLabels}
                onClick={() => setShowLabels((v) => !v)}
              >
                {t('atlas.map.labels')}
              </button>
              <button
                className="btn small ghost"
                aria-pressed={showGhost}
                onClick={() => setShowGhost((v) => !v)}
              >
                {t('atlas.map.ghost')}
              </button>
            </div>
          )}
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
            {t('atlas.map.hint')}
          </p>
        </Card>
      </div>

      <Card title={t('atlas.controls')} className="stack" style={{ marginBottom: 18 }}>
        <div className="row">
          <button className="btn" data-action="scramble" onClick={scramble}>
            {t('common.scramble')}
          </button>
          <button
            className="btn"
            data-action="reset"
            onClick={() => {
              player.yieldToUser();
              solveToken.current++;
              actions.resetToSolved();
              setSelected(null);
              clearPreview();
            }}
          >
            {t('common.resetToSolved')}
          </button>
          <button
            className="btn primary"
            data-action="solve"
            onClick={runSolve}
            disabled={solving || solved || !state.tablesReady}
          >
            {solving ? t('common.searching') : t('atlas.solveAndPlay')}
          </button>
        </div>

        <Transport />

        {yielded ? (
          <div className="card-note">{t('atlas.playbackStopped')}</div>
        ) : null}
        {solveError ? (
          <div className="card-note" style={{ color: 'var(--danger)' }}>
            {t('solver.failed')} {solveError}
          </div>
        ) : null}

        <div>
          <div className="card-note" style={{ marginBottom: 4 }}>{t('atlas.moveList')}</div>
          <Sequence
            moves={state.moves}
            cursor={state.cursor}
            onSeek={(i) => { player.seek(i); }}
            empty={t('atlas.moveList.empty')}
          />
        </div>

        <div>
          <div className="card-note" style={{ marginBottom: 6 }}>{t('atlas.byHand')}</div>
          <PreviewMovePad onPreview={setPreviewMove} onMove={manualMove} />
        </div>

        {solution ? (
          <Callout title={t('atlas.solutionFound', { n: solution.length })}>
            <p style={{ marginBottom: 6 }}>{t('atlas.solutionHint')}</p>
            <Sequence moves={solution.moves} />
          </Callout>
        ) : null}
      </Card>

      <div className="split" style={{ marginBottom: 18 }}>
        <StickerInspector facelet={selected ?? hovered} isSelection={selected !== null} />
        <Card title={t('atlas.reading')}>
          <div className="prose">
            <p>{t('atlas.reading.p1')}</p>
            <ul style={{ marginBottom: 8 }}>
              <li>{t('atlas.reading.b1')}</li>
              <li>{t('atlas.reading.b2')}</li>
              <li>{t('atlas.reading.b3')}</li>
            </ul>
            <p style={{ marginBottom: 0 }}>
              {t('atlas.reading.p2')}{' '}
              <a href="#/graph">{t('nav.graph')}</a>{' · '}
              <span className="mono-ltr">{formatBig(TOTAL_STATES)}</span>
            </p>
          </div>
        </Card>
      </div>

      <Card title={t('atlas.whereThisFits')}>
        <div className="prose">
          <p style={{ marginBottom: 0 }}>{t('atlas.whereThisFits.body')}</p>
        </div>
      </Card>
    </>
  );
}

/**
 * A move pad that reports hover, so a turn can be previewed before it is made.
 *
 * Every path out of a button clears the preview - leave, blur, and the click
 * itself - because a preview that outlives the pointer leaves the cube drawn
 * with twenty stickers lit and thirty-four faded.
 */
function PreviewMovePad({ onPreview, onMove }: {
  onPreview: (m: number | null) => void; onMove: (m: number) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div
      className="move-pad"
      onMouseLeave={() => onPreview(null)}
      onPointerLeave={() => onPreview(null)}
    >
      {[0, 1, 2, 3, 4, 5].map((face) => (
        <div key={face} style={{ display: 'grid', gap: 4 }}>
          <div className="card-note mono-ltr" style={{ textAlign: 'center' }}>
            {FACE_NAMES[face]}
          </div>
          {[0, 1, 2].map((p) => {
            const move = face * 3 + p;
            return (
              <button
                key={move}
                type="button"
                className="move-chip mono-ltr"
                style={{ width: '100%' }}
                title={describeMove(move, t)}
                onMouseEnter={() => onPreview(move)}
                onMouseLeave={() => onPreview(null)}
                onFocus={() => onPreview(move)}
                onBlur={() => onPreview(null)}
                onClick={() => { onPreview(null); onMove(move); }}
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
  const { t } = useI18n();
  const state = useAppState((s) => s);
  const facelets = useMemo(
    () => currentFacelets(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.origin, state.cursor, state.moves],
  );

  if (facelet === null) {
    return (
      <Card title={t('atlas.inspector')} note={t('atlas.inspector.empty')}>
        <p className="card-note" style={{ margin: 0 }}>{t('atlas.inspector.emptyHelp')}</p>
      </Card>
    );
  }

  const node = nodeForFacelet(facelet);
  const face = FACE_NAMES[node.face];
  const slot = (facelet % 9) + 1;
  const siblings = siblingFacelets(facelet);
  const pieceKey = siblings.length === 2 ? 'corner' : siblings.length === 1 ? 'edge' : 'centre';
  const piece = t(`piece.${pieceKey}`);
  const colour = facelets[facelet] as keyof typeof FACE_COLOR_NAMES;
  const movesTouching: string[] = [];
  for (let m = 0; m < 18; m += 3) {
    if (faceletsAffectedBy(m).includes(facelet)) movesTouching.push(FACE_NAMES[m / 3]);
  }
  const circles = node.circles.map((c) => MAP_CIRCLES[c]);

  return (
    <Card
      title={t('atlas.inspector')}
      note={isSelection ? t('atlas.inspector.pinned') : t('atlas.inspector.following')}
    >
      <div className="row" style={{ gap: 18, marginBottom: 12 }}>
        <Stat
          value={<bdi className="mono-ltr">{face}{slot}</bdi>}
          label={t('atlas.inspector.slot')}
          sub={t('atlas.inspector.slotSub', { piece, face })}
        />
        <Stat
          value={(
            <span style={{
              display: 'inline-block', width: 26, height: 26, borderRadius: 6,
              background: `var(--${colour.toLowerCase()})`,
              border: '1px solid var(--line-strong)', verticalAlign: 'middle',
            }} />
          )}
          label={t('atlas.inspector.colourNow')}
          sub={t(`colour.${FACE_COLOR_NAMES[colour]}`)}
        />
        <Stat
          value={movesTouching.length
            ? <bdi className="mono-ltr">{movesTouching.join(' ')}</bdi>
            : t('common.none')}
          label={t('atlas.inspector.movedBy')}
          sub={pieceKey === 'centre' ? t('atlas.inspector.centreSub') : t('atlas.inspector.movedBySub')}
        />
      </div>
      <p className="card-note" style={{ marginBottom: siblings.length ? 6 : 0 }}>
        {t('atlas.inspector.address', {
          a: circles[0].layer, famA: circles[0].family.id,
          b: circles[1].layer, famB: circles[1].family.id,
        })}
      </p>
      {siblings.length ? (
        <p className="card-note" style={{ margin: 0 }}>
          {t('atlas.inspector.shares', {
            piece,
            others: siblings.map((s2) => `${FACE_NAMES[Math.floor(s2 / 9)]}${(s2 % 9) + 1}`).join(' + '),
          })}
        </p>
      ) : (
        <p className="card-note" style={{ margin: 0 }}>{t('atlas.inspector.centre')}</p>
      )}
    </Card>
  );
}
