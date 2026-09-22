import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { TransportDock } from '../components/TransportDock';
import { Callout, Card, Sequence, Segmented, Stat, formatNodes } from '../components/ui';
import { SolutionReport } from './LabPage';
import { actions, currentFacelets, isSolved, useAppState } from '../state/store';
import { player } from '../state/player';
import { requestScramble, requestStats, solve, solveOptimally } from '../solver/client';
import type { TableStats } from '../solver/protocol';
import type { Solution } from '../solver/twophase';
import { METRIC_NOTES, NOTABLE_POSITIONS } from '../data/facts';
import { parseSequence } from '../cube/notation';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import { GODS_NUMBER } from '../cube/defs';
import { useI18n } from '../i18n/I18nProvider';
import { usePublishAssistantContext } from '../jev/assistantContext';
import { go } from '../state/navigation';

type Engine = 'two-phase' | 'optimal';

export function SolverPage(): JSX.Element {
  // What the study panel offers from this page. The panel itself always
  // carries the universal help; these are the jumps that only make sense
  // from here.
  usePublishAssistantContext(() => ({ labelKey: 'explore.tab.solvers', actions: [
      { id: 'lesson-search', labelKey: 'assist.act.searchLesson', noteKey: 'assist.act.searchLesson.note',
        run: () => go('#/learn/search') },
      { id: 'lesson-gods', labelKey: 'assist.act.godsLesson', noteKey: 'assist.act.godsLesson.note',
        run: () => go('#/learn/gods-number') },
    ] }), []);

  const { t } = useI18n();
  const state = useAppState((s) => s);
  const facelets = useMemo(
    () => currentFacelets(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.origin, state.cursor, state.moves],
  );
  const solved = useMemo(() => isSolved(state), [facelets]); // eslint-disable-line react-hooks/exhaustive-deps
  const [engine, setEngine] = useState<Engine>('two-phase');
  const [budget, setBudget] = useState(6);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Solution | null>(null);
  const [progress, setProgress] = useState<{ stage: string; fraction: number } | null>(null);
  const [proven, setProven] = useState<{ bound: number; nodes: number } | null>(null);
  const [stats, setStats] = useState<TableStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);

  // Results are tied to a position; moving the cube discards them.
  useEffect(() => { setResult(null); setProven(null); }, [facelets, engine]);

  useEffect(() => {
    if (!state.tablesReady) return;
    let live = true;
    requestStats().then((s) => { if (live) setStats(s); }).catch(() => undefined);
    // eslint-disable-next-line consistent-return
    return () => { live = false; };
  }, [state.tablesReady]);

  const run = async (): Promise<void> => {
    const id = ++token.current;
    const target = facelets;
    setRunning(true); setResult(null); setProven(null); setProgress(null); setError(null);
    const fresh = (): boolean => id === token.current && currentFacelets() === target;
    try {
      if (engine === 'two-phase') {
        const s = await solve(target, {
          timeBudgetMs: budget * 1000,
          maxLength: GODS_NUMBER,
          onImprove: (partial) => { if (fresh()) setResult(partial); },
        });
        if (fresh()) setResult(s);
      } else {
        const s = await solveOptimally(target, {
          timeBudgetMs: budget * 1000,
          onProgress: (stage, fraction) => { if (id === token.current) setProgress({ stage, fraction }); },
          onDepth: (bound, nodes) => { if (fresh()) setProven({ bound, nodes }); },
        });
        if (fresh()) setResult(s);
      }
    } catch (err) {
      if (id === token.current) setError((err as Error).message);
    } finally {
      if (id === token.current) { setRunning(false); setProgress(null); }
    }
  };

  const setUp = async (turns: number, random: boolean): Promise<void> => {
    player.yieldToUser();
    token.current++;
    const r = await requestScramble(turns, random);
    actions.setPosition(r.facelets, r.moves);
  };

  const loadPosition = (scramble: string): void => {
    player.yieldToUser();
    token.current++;
    const moves = parseSequence(scramble).moves;
    actions.setPosition(faceletString(toFacelets(CubieCube.fromMoves(moves))), moves);
  };

  return (
    <>

      <div className="grid three" style={{ marginBottom: 20 }}>
        <Card title={t('solver.anyTitle')}>
          <p style={{ marginBottom: 6 }}>{t('solver.anyBody')}</p>
          <span className="tag ok">{t('solver.anyTag')}</span>
        </Card>
        <Card title={t('solver.boundTitle')}>
          <p style={{ marginBottom: 6 }}>{t('solver.boundBody')}</p>
          <span className="tag warn">{t('solver.boundTag')}</span>
        </Card>
        <Card title={t('solver.proveTitle')}>
          <p style={{ marginBottom: 6 }}>{t('solver.proveBody')}</p>
          <span className="tag danger">{t('solver.proveTag')}</span>
        </Card>
      </div>

      <div className="split">
        <div className="stack">
          <Card
            title={t('solver.position')}
            note={solved ? t('common.solved') : t('common.scrambled')}
            actions={(
              <div className="row tight">
                <button className="btn small" onClick={() => void setUp(25, true)}>
                  {t('solver.random')}
                </button>
                <button
                  className="btn small ghost"
                  onClick={() => { player.yieldToUser(); token.current++; actions.resetToSolved(); }}
                >
                  {t('common.reset')}
                </button>
              </div>
            )}
          >
            <Cube3D onUserMove={(m) => { player.yieldToUser(); actions.applyMove(m); }} />
            {/* A solution this page found is queued, not applied. Without a
                transport there was nothing on the page that could play it. */}
            <div style={{ marginTop: 12 }}>
              <TransportDock variant="inline" />
            </div>
          </Card>

          <Card title={t('solver.knownPosition')}>
            <div className="stack" style={{ gap: 8 }}>
              {NOTABLE_POSITIONS.slice(0, 4).map((p) => (
                <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.88rem' }}>{t(`notable.${p.id}.name`)}</span>
                  <button className="btn small" onClick={() => loadPosition(p.scramble)}>
                    {t('lab.load')}
                  </button>
                </div>
              ))}
              <div className="row">
                <span className="card-note">{t('solver.nudge')}</span>
              </div>
              <div className="row tight">
                {[3, 5, 7, 9, 11].map((n) => (
                  <button key={n} className="btn small" onClick={() => void setUp(n, false)}>
                    {t('solver.turnsN', { n })}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card
            title={t('solver.search')}
            actions={(
              <Segmented
                value={engine}
                onChange={(v) => setEngine(v)}
                options={[
                  { value: 'two-phase', label: t('solver.engine.twoPhase'), title: t('solver.engine.twoPhaseHint') },
                  { value: 'optimal', label: t('solver.engine.optimal'), title: t('solver.engine.optimalHint') },
                ]}
              />
            )}
          >
            <div className="stack">
              <label className="field">
                {t('solver.budget', { n: budget })}
                <input
                  type="range" min={1} max={60} value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                />
              </label>
              <div className="row">
                <button
                  className="btn primary"
                  onClick={run}
                  disabled={running || solved || !state.tablesReady}
                >
                  {running
                    ? t('common.searching')
                    : engine === 'two-phase' ? t('solver.findShort') : t('solver.proveShortest')}
                </button>
                {result?.moves.length ? (
                  <button
                    className="btn"
                    onClick={() => { player.stop(); actions.queueMoves(result.moves); }}
                  >
                    {t('solver.queue')}
                  </button>
                ) : null}
              </div>

              {progress ? (
                <div>
                  <div className="card-note" style={{ marginBottom: 4 }}>
                    {t('solver.buildingPdb', { stage: progress.stage })}
                  </div>
                  <div className="meter"><i style={{ width: `${Math.round(progress.fraction * 100)}%` }} /></div>
                </div>
              ) : null}

              {engine === 'optimal' && running && proven ? (
                <Callout title={t('solver.ruledOut', { n: proven.bound - 1 })}>
                  <p style={{ margin: 0 }}>
                    {t('solver.ruledOutBody', { nodes: proven.nodes.toLocaleString('en-US') })}
                  </p>
                </Callout>
              ) : null}

              {error ? (
                <Callout kind="danger" title={t('solver.failed')}>
                  <p style={{ margin: 0 }}>{error}</p>
                </Callout>
              ) : result ? (
                <OptimalReport result={result} engine={engine} />
              ) : running ? (
                <div className="shimmer" style={{ height: 70 }} />
              ) : (
                <p className="card-note" style={{ margin: 0 }}>
                  {engine === 'two-phase' ? t('solver.twoPhaseIdle') : t('solver.optimalIdle')}
                </p>
              )}
            </div>
          </Card>

          <Card title={t('solver.metrics')}>
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('solver.metric')}</th>
                    <th>{t('solver.metricRule')}</th>
                    <th className="num">{t('solver.godsNumber')}</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_NOTES.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{t(`metric.${m.id}.name`)}</strong>
                        <div className="card-note">{t(`metric.${m.id}.note`)}</div>
                      </td>
                      <td>{t(`metric.${m.id}.rule`)}</td>
                      <td className="num">
                        {m.godsNumber}
                        {m.proved ? null : <div className="card-note">{t('lab.bestKnownBound')}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {stats ? <TableReport stats={stats} /> : null}
        </div>
      </div>
    </>
  );
}

/**
 * The optimal engine is the only one allowed to say "shortest", and it only
 * says it when the search actually exhausted every shorter depth. When it runs
 * out of budget, what it reports is the theorem it did establish - a lower
 * bound - never a guess dressed up as an answer.
 */
function OptimalReport({ result, engine }: { result: Solution; engine: Engine }): JSX.Element {
  const { t } = useI18n();
  if (engine === 'two-phase') return <SolutionReport solution={result} />;
  if (result.length < 0) {
    return (
      <Callout kind="warn" title={t('solution.exhausted', { n: result.lowerBound - 1 })}>
        <p>{t('solution.exhaustedBody', { nodes: result.nodes.toLocaleString('en-US') })}</p>
        <p style={{ marginBottom: 0 }}>{t('solution.exhaustedBody2')}</p>
      </Callout>
    );
  }
  // A completed optimal search proves optimality; anything short of that falls
  // back to the same cautious reporting the two-phase engine gets.
  if (result.guarantee !== 'proven-optimal') return <SolutionReport solution={result} />;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 14 }}>
        <Stat value={result.length} label={t('solution.moves')} sub={t('solution.andNoFewer')} />
        <Stat
          value={formatNodes(result.nodes)}
          label={t('solution.examined')}
          sub={t('solution.msTaken', { ms: result.millis })}
        />
      </div>
      <div className="row"><span className="tag ok">{t('solution.provenOptimal')}</span></div>
      <Sequence moves={result.moves} />
      <p className="card-note" style={{ margin: 0 }}>
        {t('solution.provenNote', { n: result.length })}
      </p>
    </div>
  );
}

function TableReport({ stats }: { stats: TableStats }): JSX.Element {
  const { t } = useI18n();
  const core = (stats.coreBytes / 1048576).toFixed(1);
  const pdb = (stats.optimalBytes / 1048576).toFixed(1);
  return (
    <Card
      title={t('solver.memory')}
      note={stats.optimalBytes
        ? t('solver.memorySubPdb', { core, pdb })
        : t('solver.memorySub', { core })}
    >
      <p className="card-note">{t('solver.memoryBody')}</p>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>{t('solver.abstraction')}</th>
              <th className="num">{t('solver.states')}</th>
              <th className="num">{t('solver.diameter')}</th>
              <th>{t('solver.spread')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stats.histograms).map(([name, hist]) => {
              const total = hist.reduce((a, b) => a + b, 0);
              const max = Math.max(...hist);
              return (
                <tr key={name}>
                  <td className="mono-ltr">{name}</td>
                  <td className="num">{total.toLocaleString('en-US')}</td>
                  <td className="num">{stats.diameters[name]}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 26, direction: 'ltr' }}>
                      {hist.map((v, i) => (
                        <div
                          key={i}
                          title={`${v.toLocaleString('en-US')} · ${t('common.distance')} ${i}`}
                          style={{
                            width: 7,
                            height: `${Math.max(2, (v / max) * 26)}px`,
                            background: 'var(--accent)',
                            opacity: 0.35 + 0.65 * (v / max),
                            borderRadius: 1,
                          }}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
