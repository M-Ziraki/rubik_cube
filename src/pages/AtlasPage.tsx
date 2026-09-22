import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { TransportDock } from '../components/TransportDock';
import { PageBar, ErrandBar } from '../components/PageBar';
import { Welcome } from '../components/Welcome';
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
import { TOTAL_STATES } from '../data/facts';
import { T, useI18n } from '../i18n/I18nProvider';
import { go } from '../state/navigation';
import { session, useCollapsed, useSession } from '../state/session';
import { usePublishAssistantContext } from '../jev/assistantContext';
import type { CommandAction } from '../jev/protocol';
import type { Solution } from '../solver/twophase';

/**
 * The workspace.
 *
 * What changed, and why, in one place: the cube and the map were already the
 * best things on the page, and everything that let a learner *do* anything to
 * them was a thousand pixels underneath. The verbs are now in the bar above
 * the two views, playback is docked directly beneath them, and the tools a
 * learner reaches for less often - the sticker inspector, the move list, the
 * by-hand pad - are grouped into one panel that remembers whether it was open.
 *
 * Two views, one state, and no third copy of the cube anywhere: that part was
 * right and is untouched.
 */
export function AtlasPage(): JSX.Element {
  const { t, dir } = useI18n();
  const state = useAppState((s) => s);
  const facelets = useMemo(
    () => currentFacelets(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.origin, state.cursor, state.moves],
  );
  const solved = useMemo(() => isSolved(state), [facelets]); // eslint-disable-line react-hooks/exhaustive-deps
  const anim = useStickerAnimation();
  const welcomeSeen = useSession((s) => s.welcomeSeen);
  const errand = useSession((s) => s.errand);
  const [toolsCollapsed, setToolsCollapsed] = useCollapsed('atlas.tools', false);

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

  const runSolve = useCallback(async (): Promise<void> => {
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
  }, []);

  const scramble = useCallback(async (): Promise<void> => {
    player.yieldToUser();
    solveToken.current++;
    setSolving(false);
    const r = await requestScramble(22, false);
    actions.setPosition(r.facelets, r.moves);
    setSelected(null);
    clearPreview();
  }, [clearPreview]);

  const reset = useCallback((): void => {
    player.yieldToUser();
    solveToken.current++;
    actions.resetToSolved();
    setSelected(null);
    clearPreview();
  }, [clearPreview]);

  const manualMove = useCallback((m: number): void => {
    // A hand-turn during playback stops the player rather than racing it.
    const wasPlaying = player.isActive();
    player.yieldToUser();
    setYielded(wasPlaying);
    solveToken.current++;
    actions.applyMove(m);
    clearPreview();
  }, [clearPreview]);

  /**
   * The assistant's actions, every one routed through the same functions the
   * buttons use. Nothing here is a new way to change the cube; it is a new way
   * to reach the existing ones.
   */
  const runCommand = useCallback((action: CommandAction): void => {
    switch (action) {
      case 'scramble': void scramble(); break;
      case 'reset': reset(); break;
      case 'solve': void runSolve(); break;
      case 'play': player.play(); break;
      case 'step-forward': player.stepForward(); break;
      case 'step-back': player.stepBack(); break;
      case 'show-sticker-map': setShowLabels(true); break;
      case 'show-state-space': go('#/graph'); break;
      case 'open-notation-lesson': go('#/course/notation'); break;
      case 'open-training': go('#/training'); break;
      case 'explain-inverse': go('#/course/notation'); break;
      default: break;
    }
  }, [scramble, reset, runSolve]);

  // What the assistant can offer from here. Published while this page is on
  // screen and withdrawn when it leaves, so the panel never advertises an
  // action that would act on a page the learner has left.
  usePublishAssistantContext(() => ({
    labelKey: 'nav.atlas',
    commandSink: runCommand,
    actions: [
      {
        id: 'scramble', labelKey: 'assist.act.scramble', noteKey: 'assist.act.scramble.note',
        run: () => { void scramble(); },
      },
      {
        id: 'solve', labelKey: 'assist.act.solve', noteKey: 'assist.act.solve.note',
        run: () => { void runSolve(); },
      },
      {
        id: 'notation', labelKey: 'assist.act.notation', noteKey: 'assist.act.notation.note',
        run: () => go('#/course/notation'),
      },
    ],
  }), [runCommand, scramble, runSolve]);

  /**
   * Keyboard control of playback.
   *
   * The arrows follow the reading direction, exactly as the buttons do: in
   * Persian the button labelled "next" points left, so the left arrow is the
   * one that means next. An arrow that disagreed with the arrow drawn next to
   * it would be worse than no shortcut at all.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el?.closest('[role="dialog"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); player.toggle(); }
      else if (e.key === forward) { e.preventDefault(); player.stepForward(); }
      else if (e.key === back) { e.preventDefault(); player.stepBack(); }
      else if (e.key === 'Home') { e.preventDefault(); player.restart(); }
      else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dir]);

  const mapNote = anim.progress < 1 && anim.move !== null
    ? t('atlas.map.turning', { move: MOVE_NAMES[anim.move] })
    : previewMove !== null
      ? t('atlas.map.preview', { move: MOVE_NAMES[previewMove] })
      : t('atlas.map.idle');

  return (
    <>
      <PageBar
        title={t('nav.atlas')}
        status={(
          <span className={`tag ${solved ? 'ok' : ''}`}>
            {solved ? t('common.solved') : t('atlas.cube.movesFromStart', { n: state.cursor })}
          </span>
        )}
        actions={(
          <>
            <button className="btn" data-action="scramble" onClick={scramble}>
              {t('common.scramble')}
            </button>
            <button
              className="btn primary" data-action="solve" onClick={runSolve}
              disabled={solving || solved || !state.tablesReady}
            >
              {solving ? t('common.searching') : t('atlas.solveAndPlay')}
            </button>
            <button className="btn" data-action="reset" onClick={reset}>
              {t('common.resetToSolved')}
            </button>
          </>
        )}
        about={(
          <div className="prose">
            <h3 style={{ marginTop: 0 }}>{t('atlas.title')}</h3>
            <p><T k="atlas.lede" /></p>
            <ul style={{ marginBottom: 8 }}>
              <li><T k="atlas.reading.b1" /></li>
              <li><T k="atlas.reading.b2" /></li>
              <li><T k="atlas.reading.b3" /></li>
            </ul>
            <p style={{ marginBottom: 6 }}><T k="atlas.whereThisFits.body" /></p>
            <p className="card-note" style={{ marginBottom: 0 }}>
              {t('atlas.shortcuts')}
            </p>
          </div>
        )}
      >
        {errand ? (
          <ErrandBar
            fromKey={errand.fromKey}
            aboutKey={errand.aboutKey}
            onReturn={() => { const to = errand.returnTo; session.endErrand(); go(to); }}
          />
        ) : null}
      </PageBar>

      {!welcomeSeen ? <Welcome /> : null}

      <div className="stage">
        <Card
          className="stage-panel"
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
          <p className="card-note stage-hint">{t('atlas.cube.hint')}</p>
        </Card>

        <Card
          className="stage-panel"
          title={t('atlas.map')}
          note={mapNote}
          actions={(
            <div className="row tight">
              <button
                className="btn small ghost" aria-pressed={showLabels}
                onClick={() => setShowLabels((v) => !v)}
              >
                {t('atlas.map.labels')}
              </button>
              <button
                className="btn small ghost" aria-pressed={showGhost}
                onClick={() => setShowGhost((v) => !v)}
              >
                {t('atlas.map.ghost')}
              </button>
            </div>
          )}
        >
          <div className="map-frame">
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
          <p className="card-note stage-hint">{t('atlas.map.hint')}</p>
        </Card>
      </div>

      <TransportDock />

      {yielded ? <div className="card-note dock-note">{t('atlas.playbackStopped')}</div> : null}
      {solveError ? (
        <div className="card-note dock-note" style={{ color: 'var(--danger)' }}>
          {t('solver.failed')} {solveError}
        </div>
      ) : null}
      {solution ? (
        <Callout title={t('atlas.solutionFound', { n: solution.length })}>
          <p style={{ marginBottom: 6 }}>{t('atlas.solutionHint')}</p>
          <Sequence name="solution" label={t('atlas.solutionHint')} moves={solution.moves} />
        </Callout>
      ) : null}

      {/*
        Everything below is the second tier: useful, not constant. It collapses
        into one line, and the choice is remembered, so a learner who works
        mostly with the two views is not scrolling past three cards they never
        opened - and one who uses the pad every day never has to reopen it.
      */}
      <section className="tools">
        <button
          className="tools-toggle"
          aria-expanded={!toolsCollapsed}
          aria-controls="atlas-tools"
          onClick={() => setToolsCollapsed(!toolsCollapsed)}
        >
          <span className="tools-caret" aria-hidden="true">{toolsCollapsed ? '▸' : '▾'}</span>
          {t('atlas.tools')}
          <span className="card-note">{t('atlas.tools.note')}</span>
        </button>
        {!toolsCollapsed ? (
          <div className="tools-body" id="atlas-tools">
            <div className="split">
              <Card title={t('lab.turnTheCube')} note={t('atlas.byHand')}>
                <MovePad
                  onMove={manualMove}
                  onPreview={setPreviewMove}
                  header="letter"
                  keyboard={false}
                />
                <div className="tools-sub">
                  <div className="card-note" style={{ marginBottom: 4 }}>{t('atlas.moveList')}</div>
                  <Sequence
                    name="moves"
                    label={t('atlas.moveList')}
                    moves={state.moves}
                    cursor={state.cursor}
                    onSeek={(i) => { player.seek(i); }}
                    empty={t('atlas.moveList.empty')}
                  />
                </div>
              </Card>
              <StickerInspector facelet={selected ?? hovered} isSelection={selected !== null} />
            </div>
            <Card title={t('atlas.reading')} style={{ marginTop: 14 }}>
              <div className="prose">
                <p style={{ marginBottom: 0 }}>
                  <T k="atlas.reading.p2" />{' '}
                  <a href="#/graph">{t('nav.graph')}</a>{' · '}
                  <span className="mono-ltr">{formatBig(TOTAL_STATES)}</span>
                </p>
              </div>
            </Card>
          </div>
        ) : null}
      </section>
    </>
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
        <div className="empty-state">
          <span className="empty-glyph" aria-hidden="true">◎</span>
          <p className="card-note" style={{ margin: 0 }}>{t('atlas.inspector.emptyHelp')}</p>
        </div>
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
