import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { ColorGrid, ColorPalette } from '../scan/ColorGrid';
import { Callout, Card, Sequence, Stat } from '../components/ui';
import { TransportDock } from '../components/TransportDock';
import { actions, useAppState } from '../state/store';
import { player } from '../state/player';
import { diagnose, faceletString, parseFaceletString, toFacelets } from '../cube/facelet';
import { FACE_COLOR_NAMES, FACE_NAMES, GODS_NUMBER, MOVE_NAMES, SOLVED_FACELETS } from '../cube/defs';
import { describeMove } from '../cube/notation';
import { useI18n } from '../i18n/I18nProvider';
import { usePublishAssistantContext } from '../jev/assistantContext';
import { go } from '../state/navigation';
import { explainMoves, requestScramble, solve } from '../solver/client';
import type { SolutionNarrative } from '../cube/analysis';
import type { Solution } from '../solver/twophase';
import { METHODS } from '../data/methods';

export function ScanPage(): JSX.Element {
  // What the study panel offers from this page. The panel itself always
  // carries the universal help; these are the jumps that only make sense
  // from here.
  usePublishAssistantContext(() => ({ labelKey: 'practise.tab.yourCube', actions: [
      { id: 'lesson-notation', labelKey: 'assist.act.notation', noteKey: 'assist.act.notation.note',
        run: () => go('#/learn/notation') },
      { id: 'lesson-method', labelKey: 'assist.act.method', noteKey: 'assist.act.method.note',
        run: () => go('#/learn/human-vs-machine') },
    ] }), []);

  const { t } = useI18n();
  const tablesReady = useAppState((s) => s.tablesReady);
  const [grid, setGrid] = useState<Uint8Array>(() => parseFaceletString(SOLVED_FACELETS));
  const [brush, setBrush] = useState(0);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [narrative, setNarrative] = useState<SolutionNarrative | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  const token = useRef(0);

  const check = useMemo(() => diagnose(grid), [grid]);

  const paint = (index: number, face: number): void => {
    setGrid((g) => { const next = Uint8Array.from(g); next[index] = face; return next; });
    setSolution(null); setNarrative(null); setAccepted(null);
  };

  const loadRandom = async (): Promise<void> => {
    token.current++;
    const r = await requestScramble(25, true);
    setGrid(parseFaceletString(r.facelets));
    setSolution(null); setNarrative(null); setAccepted(null);
  };

  const clearToSolved = (): void => {
    token.current++;
    setGrid(parseFaceletString(SOLVED_FACELETS));
    setSolution(null); setNarrative(null); setAccepted(null);
  };

  const buildAndSolve = async (): Promise<void> => {
    if (!check.ok || !check.cube) return;
    const facelets = faceletString(toFacelets(check.cube));
    setAccepted(facelets);
    player.stop();
    actions.setPosition(facelets, []);
    const id = ++token.current;
    setBusy(true); setSolution(null); setNarrative(null); setSolveError(null);
    try {
      const s = await solve(facelets, {
        timeBudgetMs: 10000,
        maxLength: GODS_NUMBER,
        onImprove: (partial) => { if (id === token.current) setSolution(partial); },
      });
      if (id !== token.current) return;
      setSolution(s);
      if (s.moves.length) {
        const narr = await explainMoves(facelets, s.moves);
        if (id === token.current) setNarrative(narr);
      }
    } catch (err) {
      if (id === token.current) setSolveError((err as Error).message);
    } finally {
      if (id === token.current) setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const c = new Array(6).fill(0);
    for (let i = 0; i < 54; i++) c[grid[i]]++;
    return c;
  }, [grid]);

  return (
    <>

      <div className="split">
        <div className="stack">
          <Card
            title={t('scan.enter')}
            note={t('scan.enterSub')}
            actions={(
              <div className="row tight">
                <button className="btn small ghost" onClick={clearToSolved}>{t('common.clear')}</button>
                <button className="btn small ghost" onClick={loadRandom}>{t('scan.fillRandom')}</button>
              </div>
            )}
          >
            <div className="stack">
              <ColorPalette value={brush} onChange={setBrush} />
              <div className="card-note">
                {t('scan.painting', {
                  colour: t(`colour.${FACE_COLOR_NAMES[FACE_NAMES[brush]]}`),
                  face: FACE_NAMES[brush],
                })}
              </div>
              <div className="scroll-x">
                <ColorGrid facelets={grid} brush={brush} onPaint={paint} />
              </div>
              <div className="row tight">
                {FACE_NAMES.map((f, i) => (
                  <span key={f} className={`tag ${counts[i] === 9 ? 'ok' : 'danger'}`}>
                    {t('scan.counts', { colour: t(`colour.${FACE_COLOR_NAMES[f]}`), n: counts[i] })}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <Card title={t('scan.howToRead')}>
            <div className="prose">
              <p>{t('scan.howToRead.p1')}</p>
              <p style={{ marginBottom: 0 }}>{t('scan.howToRead.p2')}</p>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title={t('scan.validation')} note={t('scan.validationSub')}>
            {check.ok ? (
              <>
                <div className="row" style={{ marginBottom: 10 }}>
                  <span className="tag ok">{t('scan.valid')}</span>
                </div>
                <p className="card-note">{t('scan.validBody')}</p>
                <button className="btn primary" onClick={buildAndSolve} disabled={busy || !tablesReady}>
                  {busy ? t('scan.solving') : t('scan.rebuildAndSolve')}
                </button>
              </>
            ) : (
              <div className="stack">
                {check.problems.map((p) => (
                  <Callout
                    key={p.code}
                    kind={p.code === 'parity' || p.code === 'twist' || p.code === 'flip' ? 'warn' : 'danger'}
                    title={t(`error.${p.code}`)}
                  >
                    {p.detail.length ? (
                      <ul style={{ margin: 0 }}>
                        {p.detail.slice(0, 6).map((d, i) => <li key={i}>{t(d.key, d.params)}</li>)}
                      </ul>
                    ) : null}
                  </Callout>
                ))}
                <p className="card-note" style={{ margin: 0 }}>{t('scan.invalidNote')}</p>
              </div>
            )}
          </Card>

          <Card title={t('scan.reconstruction')}>
            {accepted ? (
              <Cube3D />
            ) : (
              <Cube3D facelets={check.ok && check.cube ? faceletString(toFacelets(check.cube)) : SOLVED_FACELETS} interactive={false} />
            )}
            {accepted ? (
              <p className="card-note" style={{ marginTop: 8, marginBottom: 0 }}>
                {t('scan.reconstructionNote')}
              </p>
            ) : null}
          </Card>

          {solveError ? (
            <Callout kind="danger" title={t('solver.failed')}>
              <p style={{ margin: 0 }}>{solveError}</p>
            </Callout>
          ) : null}

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
  const { t } = useI18n();
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

  const tail = steps.length - boundary;

  return (
    <Card
      title={t('scan.guided')}
      note={busy
        ? t('scan.guidedSubBusy', { n: solution.length })
        : t('scan.guidedSub', { n: solution.length })}
      className="stack"
    >
      <Sequence moves={moves} cursor={cursor} onSeek={(i) => player.seek(i)} />
      <TransportDock variant="inline" />

      {step ? (
        <div className="callout">
          <h4>
            {t('scan.moveOf', {
              i: cursor + 1,
              n: moves.length,
              move: MOVE_NAMES[step.move],
            })}
          </h4>
          <p style={{ marginBottom: 6 }}>{describeMove(step.move, t)}</p>
          <p style={{ marginBottom: 4 }}>
            <strong>{t('scan.why')}:</strong>{' '}
            {step.effects.map((e) => t(e.key, e.params)).join(' · ')}
          </p>
          <p className="card-note" style={{ marginBottom: 0 }}>{t('scan.whatItDoes')}</p>
        </div>
      ) : cursor >= moves.length && moves.length > 0 ? (
        <Callout title={t('scan.solvedTitle')}>
          <p style={{ margin: 0 }}>{t('scan.solvedBody')}</p>
        </Callout>
      ) : null}

      {step ? (
        <div className="row" style={{ gap: 18 }}>
          <Stat value={`${step.after.orientedEdges}/12`} label={t('scan.edgesOriented')} />
          <Stat value={`${step.after.orientedCorners}/8`} label={t('scan.cornersOriented')} />
          <Stat value={`${step.after.sliceEdgesHome}/4`} label={t('scan.sliceHome')} />
          <Stat value={`${step.after.solvedPieces}/20`} label={t('scan.piecesFinished')} />
        </div>
      ) : null}

      {boundary > 0 && boundary < steps.length ? (
        <p className="card-note" style={{ margin: 0 }}>
          {tail === 1
            ? t('scan.phaseNoteOne', { n: boundary })
            : t('scan.phaseNote', { n: boundary, m: tail })}{' '}
          {t('scan.phaseNoteTail')}
        </p>
      ) : steps.length ? (
        <p className="card-note" style={{ margin: 0 }}>{t('scan.noPhase', { n: steps.length })}</p>
      ) : null}
    </Card>
  );
}

function MethodComparison(): JSX.Element {
  const { t } = useI18n();
  const max = Math.max(...METHODS.map((m) => m.typicalMoves));
  return (
    <Card title={t('scan.methods')} className="stack">
      <p className="prose">{t('scan.methodsBody')}</p>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>{t('scan.method')}</th>
              <th className="num">{t('scan.typicalMoves')}</th>
              <th>{t('scan.memorise')}</th>
              <th>{t('scan.howItWorks')}</th>
              <th>{t('scan.whyNotOptimal')}</th>
            </tr>
          </thead>
          <tbody>
            {METHODS.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{t(`method.${m.id}.name`)}</strong>
                  <div>
                    <span className={`tag ${m.kind === 'machine' ? 'solid' : m.kind === 'hybrid' ? 'warn' : ''}`}>
                      {t(`kind.${m.kind}`)}
                    </span>
                  </div>
                </td>
                <td className="num">
                  {m.typicalMoves}
                  <div className="meter" style={{ width: 60, marginTop: 4 }}>
                    <i style={{ width: `${(m.typicalMoves / max) * 100}%` }} />
                  </div>
                </td>
                <td>{t(`method.${m.id}.learn`)}</td>
                <td>{t(`method.${m.id}.how`)}</td>
                <td>{t(`method.${m.id}.why`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
