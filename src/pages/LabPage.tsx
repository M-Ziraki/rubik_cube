import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { TransportDock } from '../components/TransportDock';
import { Callout, Card, Sequence, Stat, formatNodes } from '../components/ui';
import { actions, currentFacelets, isSolved, useAppState } from '../state/store';
import { player } from '../state/player';
import { requestScramble, solve } from '../solver/client';
import { formatSequence, invertSequence, parseSequence, simplifySequence } from '../cube/notation';
import { NOTABLE_POSITIONS } from '../data/facts';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import { useI18n, type Translate } from '../i18n/I18nProvider';
import { usePublishAssistantContext } from '../jev/assistantContext';
import { go } from '../state/navigation';
import type { Solution } from '../solver/twophase';
import { GODS_NUMBER } from '../cube/defs';

export function LabPage(): JSX.Element {
  // What the study panel offers from this page. The panel itself always
  // carries the universal help; these are the jumps that only make sense
  // from here.
  usePublishAssistantContext(() => ({ labelKey: 'cube.tab.sequences', actions: [
      { id: 'lesson-groups', labelKey: 'assist.act.groupsLesson', noteKey: 'assist.act.groupsLesson.note',
        run: () => go('#/learn/groups') },
      { id: 'open-atlas', labelKey: 'assist.act.openAtlas', noteKey: 'assist.act.openAtlas.note',
        run: () => go('#/cube') },
    ] }), []);

  const { t } = useI18n();
  const state = useAppState((s) => s);
  const facelets = useMemo(
    () => currentFacelets(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.origin, state.cursor, state.moves],
  );
  const solved = useMemo(() => isSolved(state), [facelets]); // eslint-disable-line react-hooks/exhaustive-deps
  const [solution, setSolution] = useState<Solution | null>(null);
  const [solving, setSolving] = useState(false);
  const [solveError, setSolveError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const solveToken = useRef(0);

  // A result belongs to the position it was computed for. The moment the cube
  // moves, the old answer is stale and is dropped rather than left on screen.
  useEffect(() => { setSolution(null); }, [facelets]);

  const runSolve = async (): Promise<void> => {
    const token = ++solveToken.current;
    setSolving(true);
    setSolution(null);
    setSolveError(null);
    const target = facelets;
    try {
      const s = await solve(target, {
        timeBudgetMs: 10000,
        maxLength: GODS_NUMBER,
        onImprove: (partial) => {
          if (token === solveToken.current && currentFacelets() === target) setSolution(partial);
        },
      });
      if (token === solveToken.current && currentFacelets() === target) setSolution(s);
    } catch (err) {
      if (token === solveToken.current) setSolveError((err as Error).message);
    } finally {
      if (token === solveToken.current) setSolving(false);
    }
  };

  const applySequence = (text: string): void => {
    const parsed = parseSequence(text);
    if (parsed.errors.length) {
      setInputError(t('lab.badNotation', { tokens: parsed.errors.map((e) => e.token).join(', ') }));
      return;
    }
    if (!parsed.moves.length) { setInputError(null); return; }
    setInputError(null);
    player.yieldToUser();
    player.playSequence(parsed.moves);
    setInput('');
  };

  const loadPosition = (scramble: string): void => {
    player.yieldToUser();
    solveToken.current++;
    const moves = parseSequence(scramble).moves;
    const cube = CubieCube.fromMoves(moves);
    actions.setPosition(faceletString(toFacelets(cube)), moves);
  };

  const newPosition = async (random: boolean): Promise<void> => {
    player.yieldToUser();
    solveToken.current++;
    const r = await requestScramble(25, random);
    actions.setPosition(r.facelets, r.moves);
  };

  const simplified = useMemo(
    () => simplifySequence(state.moves.slice(0, state.cursor)),
    [state.moves, state.cursor],
  );

  return (
    <>

      <div className="split">
        <div className="stack">
          <Card
            title={solved ? t('common.solved') : t('common.scrambled')}
            note={solved ? t('lab.centreOfGraph') : t('lab.effectiveMoves', { n: simplified.length })}
            actions={(
              <div className="row tight">
                <button className="btn small" onClick={() => void newPosition(true)}>
                  {t('lab.randomPosition')}
                </button>
                <button className="btn small ghost" onClick={() => void newPosition(false)}>
                  {t('lab.randomTurns')}
                </button>
              </div>
            )}
          >
            <Cube3D onUserMove={(m) => { player.yieldToUser(); actions.applyMove(m); }} />
          </Card>

          <Card title={t('lab.turnTheCube')}>
            <MovePad onMove={(m) => { player.yieldToUser(); actions.applyMove(m); }} />
          </Card>
        </div>

        <div className="stack">
          <Card
            title={t('lab.history')}
            note={<bdi className="mono-ltr">{state.cursor} / {state.moves.length}</bdi>}
            actions={(
              <div className="row tight">
                <button className="btn small ghost" onClick={() => { player.stop(); actions.clearMoves(); }}>
                  {t('common.clear')}
                </button>
              </div>
            )}
            className="stack"
          >
            <Sequence
              moves={state.moves}
              cursor={state.cursor}
              onSeek={(i) => player.seek(i)}
              empty={t('lab.historyEmpty')}
            />
            <TransportDock variant="inline" />
            {simplified.length !== state.cursor ? (
              <p className="card-note" style={{ margin: 0 }}>
                {t('lab.simplifies', {
                  n: state.cursor,
                  m: simplified.length,
                  seq: formatSequence(simplified) || t('lab.simplifiesNothing'),
                })}
              </p>
            ) : null}
          </Card>

          <Card title={t('lab.enterSequence')}>
            <div className="row">
              <input
                type="text"
                className="mono-ltr"
                value={input}
                placeholder={t('lab.sequencePlaceholder')}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applySequence(input); }}
                style={{ flex: 1, minWidth: 180 }}
              />
              <button className="btn" onClick={() => applySequence(input)}>{t('common.apply')}</button>
              <button
                className="btn ghost"
                onClick={() => applySequence(formatSequence(invertSequence(parseSequence(input).moves)))}
              >
                {t('lab.applyInverse')}
              </button>
            </div>
            {inputError ? (
              <p className="card-note" style={{ color: 'var(--danger)', marginTop: 8, marginBottom: 0 }}>
                {inputError}
              </p>
            ) : null}
          </Card>

          <Card
            title={t('lab.solveIt')}
            note={t('lab.solveItSub')}
            actions={(
              <button
                className="btn primary small"
                onClick={runSolve}
                disabled={solving || solved || !state.tablesReady}
              >
                {solving ? t('common.searching') : t('lab.findSolution')}
              </button>
            )}
          >
            {solveError ? (
              <p className="card-note" style={{ margin: 0, color: 'var(--danger)' }}>
                {t('solver.failed')} {solveError}
              </p>
            ) : solved ? (
              <p className="card-note" style={{ margin: 0 }}>{t('lab.alreadySolved')}</p>
            ) : solution ? (
              <SolutionReport
                solution={solution}
                onApply={() => { player.stop(); actions.queueMoves(solution.moves); }}
                searching={solving}
              />
            ) : solving ? (
              <div className="shimmer" style={{ height: 64 }} />
            ) : (
              <p className="card-note" style={{ margin: 0 }}>
                {t('lab.solveIdle', { n: GODS_NUMBER })}
              </p>
            )}
          </Card>

          <Card title={t('lab.famous')}>
            <div className="stack" style={{ gap: 10 }}>
              {NOTABLE_POSITIONS.map((p) => (
                <div key={p.id}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: '0.92rem' }}>{t(`notable.${p.id}.name`)}</strong>
                    <div className="row tight">
                      {p.distance ? (
                        <span className="tag">{t('lab.movesAway', { n: p.distance })}</span>
                      ) : null}
                      <button className="btn small" onClick={() => loadPosition(p.scramble)}>
                        {t('lab.load')}
                      </button>
                    </div>
                  </div>
                  <div className="card-note">{t(`notable.${p.id}.note`)}</div>
                  <bdi className="mono-ltr" style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>
                    {p.scramble}
                  </bdi>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * How a solution is reported, everywhere in the app.
 *
 * The three claims are kept strictly apart. `proven-optimal` is the only one
 * that says "shortest", and it is only ever set by a search that exhausted
 * every shorter length. Anything else is reported as a solution of a stated
 * length, with the proven lower bound shown beside it so the remaining
 * uncertainty is visible rather than glossed over.
 */
export function SolutionReport({ solution, onApply, searching }: {
  solution: Solution; onApply?: () => void; searching?: boolean;
}): JSX.Element {
  const { t } = useI18n();
  if (solution.length < 0) {
    return (
      <Callout kind="warn" title={t('solution.noneFound')}>
        <p style={{ margin: 0 }}>{t('solution.noneFoundBody', { n: solution.lowerBound })}</p>
      </Callout>
    );
  }
  const claim = claimFor(solution, t);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 14 }}>
        <Stat value={solution.length} label={t('solution.moves')} />
        <Stat
          value={solution.lowerBound}
          label={t('solution.lowerBound')}
          sub={t('solution.lowerBoundSub')}
        />
        <Stat
          value={formatNodes(solution.nodes)}
          label={t('solution.examined')}
          sub={t('solution.msTaken', { ms: solution.millis })}
        />
      </div>
      <div className="row">
        <span className={`tag ${claim.tag}`}>{claim.text}</span>
        {searching ? <span className="tag">{t('solution.stillImproving')}</span> : null}
        {solution.timedOut && !searching ? (
          <span className="tag warn">{t('solution.stoppedOnTime')}</span>
        ) : null}
      </div>
      <Sequence moves={solution.moves} />
      {onApply ? (
        <div className="row">
          <button className="btn" onClick={onApply}>{t('solution.queueMoves')}</button>
          <span className="card-note">{t('solution.queueHint')}</span>
        </div>
      ) : null}
      {solution.guarantee !== 'proven-optimal' ? (
        <p className="card-note" style={{ margin: 0 }}>
          {t('solution.notOptimalNote')}{' '}
          <a href="#/explore/solvers">{t('solution.solversPageNote')}</a>
        </p>
      ) : null}
    </div>
  );
}

/** The single place that decides what a solution is allowed to claim. */
export function claimFor(solution: Solution, t: Translate): { tag: string; text: string } {
  if (solution.guarantee === 'proven-optimal') {
    return { tag: 'ok', text: t('solution.provenOptimal') };
  }
  if (solution.length <= GODS_NUMBER) {
    return { tag: 'warn', text: t('solution.withinBound') };
  }
  return { tag: 'danger', text: t('solution.overBound') };
}
