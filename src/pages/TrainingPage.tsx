import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { Callout, Card, Sequence, Stat } from '../components/ui';
import { actions, currentCube, currentFacelets, isSolved, useAppState } from '../state/store';
import { requestScramble, solve, solveOptimally } from '../solver/client';
import { simplifySequence } from '../cube/notation';
import { LEARNING_PATH } from '../data/methods';
import { report } from '../cube/analysis';
import { LESSONS } from '../lessons/registry';
import { player } from '../state/player';
import { useI18n, type Translate } from '../i18n/I18nProvider';
import { HintLadder } from '../components/HintLadder';
import { Dialog } from '../components/Dialog';
import { EmptyState } from '../components/EmptyState';
import { ExerciseMaker } from '../components/ExerciseMaker';
import type { GeneratedExercise } from '../jev/exercise';
import { usePublishAssistantContext } from '../jev/assistantContext';
import { go } from '../state/navigation';

/** Titles, briefs and hints live in the dictionaries under `challenge.<id>.*`. */
interface Challenge {
  id: string;
  distance: number;
}

const CHALLENGES: Challenge[] = [
  { id: 'c3', distance: 3 },
  { id: 'c5', distance: 5 },
  { id: 'c7', distance: 7 },
  { id: 'c9', distance: 9 },
  { id: 'c11', distance: 11 },
];

/*
 * Three views that used to be tabs on a page of their own. They are now tabs
 * on the section that owns them - and Progress went to Learn, because "what
 * have I learned" is a different question from "give me something to do" and
 * it was hidden one level down inside the answer to the second one.
 */
/**
 * A challenge's name, whether it came off the list or was made to order.
 *
 * A generated one has no dictionary entry and should not pretend to: it is
 * named by the only thing that is true of it and proved about it, which is
 * how far from solved it is.
 */
function challengeTitle(challenge: Challenge, t: Translate): string {
  return challenge.id.startsWith('made-')
    ? t('exercise.madeTitle', { n: challenge.distance })
    : t(`challenge.${challenge.id}.title`);
}

export function ChallengeRunner(): JSX.Element {
  const { t } = useI18n();
  const state = useAppState((s) => s);
  const facelets = useMemo(
    () => currentFacelets(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.origin, state.cursor, state.moves],
  );
  const solved = useMemo(() => isSolved(state), [facelets]); // eslint-disable-line react-hooks/exhaustive-deps
  const [challenge, setChallenge] = useState<Challenge>(CHALLENGES[1]);
  const [target, setTarget] = useState<{ optimal: number; moves: number[]; proven: boolean } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [recorded, setRecorded] = useState<{ used: number; optimal: number } | null>(null);
  const token = useRef(0);

  /* ----------------------------------------------------- the hint ladder --- */

  // Everything the hint system needs, computed rather than guessed at.
  const [hintsTaken, setHintsTaken] = useState(0);
  const [restarts, setRestarts] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [emphasis, setEmphasis] = useState<number[] | null>(null);
  // The first move of a verified optimal solution for the position *now*, not
  // for the position the challenge started from. A hint about a position the
  // learner has already left would be worse than no hint.
  const [nextMove, setNextMove] = useState<number | null>(null);
  const hintToken = useRef(0);

  /*
   * The hint ladder hands us the same call its own button makes, so a learner
   * who is stuck can reach it from the study panel - which is in the same
   * corner of every page - rather than having to know that this page keeps its
   * hints halfway down the right-hand column.
   */
  const askHint = useRef<(() => void) | null>(null);
  const registerAsk = useCallback((fn: (() => void) | null) => { askHint.current = fn; }, []);

  const used = useMemo(
    () => simplifySequence(state.moves.slice(0, state.cursor)).length,
    [state.moves, state.cursor],
  );

  const start = async (c: Challenge): Promise<void> => {
    const id = ++token.current;
    player.stop();
    setChallenge(c);
    setPreparing(true);
    setTarget(null); setShowHint(false); setShowAnswer(false); setRecorded(null);
    setHintsTaken(0); setRestarts(0); setEmphasis(null); setNextMove(null);
    setStartedAt(Date.now());
    hintToken.current++;
    try {
      // Walk out from solved and then verify the true distance, so the
      // advertised difficulty is the real one rather than the scramble length.
      let facelets = '';
      let optimal = 0;
      let moves: number[] = [];
      let proven = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        const r = await requestScramble(c.distance, false);
        const check = await solveOptimally(r.facelets, { timeBudgetMs: 12000, maxLength: c.distance });
        if (check.length === c.distance) {
          facelets = r.facelets; optimal = check.length; moves = check.moves; proven = true;
          break;
        }
        if (check.length > 0 && !facelets) {
          facelets = r.facelets; optimal = check.length; moves = check.moves; proven = true;
        }
      }
      if (!facelets) {
        const r = await requestScramble(c.distance, false);
        const s = await solve(r.facelets, { timeBudgetMs: 4000 });
        facelets = r.facelets; optimal = s.length; moves = s.moves; proven = false;
      }
      if (id !== token.current) return;
      actions.setPosition(facelets, []);
      setTarget({ optimal, moves, proven });
    } finally {
      if (id === token.current) setPreparing(false);
    }
  };

  /**
   * Start a graded attempt on a position the maker has already proved.
   *
   * It goes through exactly the same state as a challenge off the list -
   * same reset, same target, same grading - because a shaped exercise that
   * scored differently from a picked one would not be comparable, and the
   * whole point of the record is that its numbers mean one thing.
   */
  const startGenerated = useCallback((exercise: GeneratedExercise): void => {
    const id = ++token.current;
    player.stop();
    setChallenge({ id: `made-${exercise.distance}`, distance: exercise.distance });
    setTarget(null); setShowHint(false); setShowAnswer(false); setRecorded(null);
    setHintsTaken(0); setRestarts(0); setEmphasis(null); setNextMove(null);
    setStartedAt(Date.now());
    hintToken.current++;
    if (id !== token.current) return;
    actions.setPosition(exercise.facelets, []);
    setTarget({ optimal: exercise.distance, moves: exercise.solution, proven: true });
  }, []);

  // Re-solve the current position whenever it changes, so the ladder always
  // describes what is on screen. Short positions, so this is quick.
  useEffect(() => {
    if (!target || solved) { setNextMove(null); return; }
    const id = ++hintToken.current;
    const at = facelets;
    solveOptimally(at, { timeBudgetMs: 8000, maxLength: 12 })
      .then((s2) => {
        if (id !== hintToken.current || currentFacelets() !== at) return;
        setNextMove(s2.moves.length ? s2.moves[0] : null);
      })
      .catch(() => { if (id === hintToken.current) setNextMove(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facelets, target, solved]);

  useEffect(() => {
    if (solved && target && used > 0 && !recorded) {
      actions.recordRun(target.optimal, used, target.optimal);
      setRecorded({ used, optimal: target.optimal });
    }
  }, [solved, target, used, recorded]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stateReport = useMemo(() => report(currentCube(state)), [facelets]);

  // What the study panel can offer from a challenge: a hint at the level the
  // learner has earned, a fresh position, and the lesson behind the skill.
  usePublishAssistantContext(() => ({
    labelKey: 'nav.training',
    actions: [
      ...(nextMove !== null ? [{
        id: 'hint',
        labelKey: 'assist.act.hint',
        noteKey: 'assist.act.hint.note',
        run: () => askHint.current?.(),
      }] : []),
      {
        id: 'new-position',
        labelKey: 'assist.act.newPosition',
        noteKey: 'assist.act.newPosition.note',
        run: () => { void start(challenge); },
      },
      {
        id: 'method',
        labelKey: 'assist.act.method',
        noteKey: 'assist.act.method.note',
        run: () => go('#/learn/human-vs-machine'),
      },
    ],
  }), [nextMove, challenge.id]);

  return (
    <div className="split">
      <div className="stack">
        <Card
          title={challengeTitle(challenge, t)}
          note={target
            ? t('training.trueOptimum', { n: target.optimal })
            : preparing ? t('training.preparingNote') : t('training.pressStart')}
        >
          <Cube3D
            emphasis={emphasis}
            onUserMove={(m) => { if (target) { player.stop(); actions.applyMove(m); } }}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn primary"
              onClick={() => start(challenge)}
              disabled={preparing || !state.tablesReady}
            >
              {preparing ? t('training.preparing') : t('training.newPosition')}
            </button>
            <button
              className="btn"
              onClick={() => {
                player.stop(); actions.rewind();
                setRestarts((n) => n + 1); setEmphasis(null);
              }}
              disabled={!target}
            >
              {t('training.startOver')}
            </button>
            <button
              className="btn ghost"
              onClick={() => { player.stop(); actions.undo(); }}
              disabled={state.cursor === 0}
            >
              {t('common.undo')}
            </button>
          </div>
        </Card>

        <Card title={t('lab.turnTheCube')}>
          <MovePad onMove={(m) => { player.stop(); actions.applyMove(m); }} disabled={!target} />
        </Card>
      </div>

      <div className="stack">
        {/*
          The shaped exercise sits above the fixed list rather than replacing
          it. A learner who knows they want seven moves should not have to ask
          for one, and a fixed list is the only thing that makes the shaped
          one legible: you can see what it chose, and what it chose instead of.
        */}
        <Card title={t('exercise.title')} note={t('exercise.sub')}>
          <ExerciseMaker disabled={preparing} onReady={startGenerated} />
        </Card>

        <Card title={t('training.pickDifficulty')}>
          <div className="stack" style={{ gap: 8 }}>
            {CHALLENGES.map((c) => (
              <button
                key={c.id}
                className="btn block"
                style={{ borderColor: c.id === challenge.id ? 'var(--accent)' : undefined }}
                onClick={() => start(c)}
                disabled={preparing}
              >
                <div>
                  <strong>{t(`challenge.${c.id}.title`)}</strong>
                  <div className="card-note">{t(`challenge.${c.id}.brief`)}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {target ? (
          <Card
            title={t('training.yourAttempt')}
            note={recorded ? t('training.recorded') : t('training.inProgress')}
          >
            <div className="row" style={{ gap: 18, marginBottom: 12 }}>
              <Stat value={used} label={t('training.yourMoves')} />
              <Stat
                value={target.optimal}
                label={t('training.optimalLabel')}
                sub={target.proven ? t('training.provenShortest') : t('training.bestFound')}
              />
              <Stat
                value={used > 0 ? `+${Math.max(0, used - target.optimal)}` : '—'}
                label={t('training.wasted')}
              />
            </div>
            {!target.proven ? (
              <p className="card-note" style={{ marginTop: -6, marginBottom: 12 }}>
                {t('training.unproven')}
              </p>
            ) : null}
            {solved && recorded ? (
              <Callout
                kind={recorded.used === recorded.optimal ? 'info' : 'warn'}
                title={recorded.used === recorded.optimal
                  ? t('training.optimalTitle')
                  : t('training.overTitle', {
                    used: recorded.used,
                    extra: recorded.used - recorded.optimal,
                  })}
              >
                <p style={{ marginBottom: 0 }}>
                  {recorded.used === recorded.optimal
                    ? t('training.optimalBody')
                    : t('training.overBody')}
                </p>
              </Callout>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ gap: 18 }}>
                  <Stat value={`${stateReport.orientedEdges}/12`} label={t('scan.edgesOriented')} />
                  <Stat value={`${stateReport.orientedCorners}/8`} label={t('scan.cornersOriented')} />
                  <Stat value={`${stateReport.solvedPieces}/20`} label={t('training.piecesHome')} />
                </div>
                {/* The progressive ladder: four rungs, all computed from a
                    proven solution, with the level chosen by rule or by Jev. */}
                <HintLadder
                  nextMove={nextMove}
                  situation={{
                    hintsTaken,
                    movesUsed: used,
                    optimalLength: target.optimal,
                    wasted: Math.max(0, used - target.optimal),
                    restarts,
                    secondsOnTask: Math.min(86400, Math.round((Date.now() - startedAt) / 1000)),
                  }}
                  onEmphasis={setEmphasis}
                  onHintTaken={() => setHintsTaken((n) => n + 1)}
                  registerAsk={registerAsk}
                />
                <div className="row">
                  <button className="btn small ghost" onClick={() => setShowHint(true)} disabled={showHint}>
                    {t('training.challengeHint')}
                  </button>
                  <button
                    className="btn small ghost"
                    onClick={() => setShowAnswer(true)}
                    disabled={showAnswer}
                  >
                    {t('training.showOptimal')}
                  </button>
                </div>
                {showHint ? (
                  <Callout title={t('training.challengeHint')}>
                    <p style={{ margin: 0 }}>
                      {challenge.id.startsWith('made-')
                        ? t('exercise.madeHint')
                        : t(`challenge.${challenge.id}.hint`)}
                    </p>
                  </Callout>
                ) : null}
                {showAnswer ? (
                  <div>
                    <div className="card-note" style={{ marginBottom: 4 }}>
                      {t('training.oneShortest')}
                    </div>
                    <Sequence moves={target.moves} />
                  </div>
                ) : null}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <div className="card-note" style={{ marginBottom: 4 }}>{t('training.movesSoFar')}</div>
              <Sequence
                moves={state.moves}
                cursor={state.cursor}
                onSeek={(i) => player.seek(i)}
                empty={t('training.noneYet')}
              />
            </div>
          </Card>
        ) : (
          <Callout title={t('training.howItWorks')}>
            <p style={{ marginBottom: 0 }}>{t('training.howItWorksBody')}</p>
          </Callout>
        )}
      </div>
    </div>
  );
}

export function ProgressView(): JSX.Element {
  const { t } = useI18n();
  const progress = useAppState((s) => s.progress);
  const [confirmReset, setConfirmReset] = useState(false);
  const runs = progress.challengeRuns;
  const recent = runs.slice(-24).reverse();
  const perfect = runs.filter((r) => r.used === r.optimal).length;
  const avgWaste = runs.length ? runs.reduce((a, r) => a + (r.used - r.optimal), 0) / runs.length : 0;

  return (
    <div className="grid two">
      <Card title={t('training.whereYouAre')}>
        <div className="row" style={{ gap: 20, marginBottom: 14 }}>
          <Stat value={`${progress.lessonsDone.length}/${LESSONS.length}`} label={t('training.lessonsDone')} />
          <Stat value={runs.length} label={t('training.attempts')} />
          <Stat value={perfect} label={t('training.optimalSolves')} />
          <Stat value={runs.length ? avgWaste.toFixed(1) : '—'} label={t('training.avgWasted')} />
        </div>
        {runs.length === 0 ? (
          <p className="card-note" style={{ margin: 0 }}>{t('training.nothingRecorded')}</p>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th className="num">{t('common.distance')}</th>
                  <th className="num">{t('training.yourBest')}</th>
                  <th>{t('training.gap')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(progress.bestByDistance)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([d, best]) => (
                    <tr key={d}>
                      <td className="num">{d}</td>
                      <td className="num">{best}</td>
                      <td>
                        {best === Number(d)
                          ? <span className="tag ok">{t('common.optimal')}</span>
                          : <span className="tag warn">+{best - Number(d)}</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="btn small ghost"
            data-action="reset-progress"
            onClick={() => setConfirmReset(true)}
          >
            {t('training.resetAll')}
          </button>
        </div>
      </Card>

      {/*
        Previously `window.confirm`, which cannot be translated, cannot be
        themed, and blocks the main thread - which stops the turn clock
        mid-animation. A Persian learner was being asked to discard their
        progress in English.
      */}
      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t('training.resetAll')}
        tone="danger"
        confirmLabel={t('training.resetConfirmAction')}
        onConfirm={() => actions.resetProgress()}
      >
        <p>{t('training.resetConfirm')}</p>
      </Dialog>

      <Card title={t('training.recent')}>
        {recent.length === 0 ? (
          <EmptyState glyph="◈" title={t('training.noAttempts')}>
            {t('training.noAttemptsHelp')}
          </EmptyState>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {recent.map((r, i) => (
              <div key={i} className="row" style={{ justifyContent: 'space-between' }}>
                <span className="card-note">{new Date(r.at).toLocaleString()}</span>
                <span>
                  {t('training.attemptLine', { used: r.used, distance: r.distance })}{' '}
                  {r.used === r.optimal
                    ? <span className="tag ok">{t('common.optimal')}</span>
                    : <span className="tag warn">+{r.used - r.optimal}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function PathView(): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="stack">
      <Callout title={t('training.pathTitle')}>
        <p style={{ marginBottom: 0 }}>{t('training.pathBody')} {t('training.pathTail')}</p>
      </Callout>
      <div className="grid two">
        {LEARNING_PATH.map((s, i) => (
          <Card
            key={s.id}
            title={t('training.stageN', { n: i + 1, stage: t(`path.${s.id}.stage`) })}
          >
            <p style={{ marginBottom: 8 }}>
              <strong>{t('training.goal')}:</strong> {t(`path.${s.id}.goal`)}
            </p>
            <p style={{ marginBottom: 0 }} className="card-note">{t(`path.${s.id}.why`)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
