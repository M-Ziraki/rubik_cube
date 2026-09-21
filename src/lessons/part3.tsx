import { useEffect, useMemo, useState } from 'react';
import { LessonBody, Quiz } from './framework';
import { Callout, Card, Sequence, Stat, formatApprox } from '../components/ui';
import { Cube3D } from '../components/Cube3D';
import { MovePad } from '../components/MovePad';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import { parseSequence } from '../cube/notation';
import { report } from '../cube/analysis';
import { requestPocketStats, preparePocket, requestStageStats, solveStage } from '../solver/client';
import type { PocketStats, StageStats } from '../solver/protocol';
import { METHODS } from '../data/methods';
import { TOTAL_STATES } from '../data/facts';
import { T, useI18n } from '../i18n/I18nProvider';
import { ConceptCheck } from '../components/ConceptCheck';

/* ============================================================= 8. groups --- */

export function LessonGroups(): JSX.Element {
  const { t } = useI18n();
  const [seq, setSeq] = useState("R U R' U'");
  const order = useMemo(() => {
    const moves = parseSequence(seq).moves;
    if (!moves.length) return 1;
    const c = CubieCube.identity();
    for (let k = 1; k <= 1300; k++) {
      c.applyMoves(moves);
      if (c.isSolved()) return k;
    }
    return -1;
  }, [seq]);

  return (
    <LessonBody>
      <p>{t('l.groups.intro')}</p>

      <h3>{t('l.groups.whatMakes')}</h3>
      <ul>
        <li>{t('l.groups.b1')}</li>
        <li>{t('l.groups.b2')}</li>
        <li>{t('l.groups.b3')}</li>
        <li><T k="l.groups.b4" /></li>
      </ul>

      <h3>{t('l.groups.order')}</h3>
      <p><T k="l.groups.orderBody" /></p>

      <Card title={t('l.groups.measure')} className="stack">
        <div className="row">
          <input
            type="text"
            className="mono-ltr"
            value={seq}
            onChange={(e) => setSeq(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <div className="row tight">
            {["R U R' U'", 'R U', "R U2 D' B D'", "R L' F B'"].map((x) => (
              <button key={x} className="btn small ghost mono-ltr" onClick={() => setSeq(x)}>{x}</button>
            ))}
          </div>
        </div>
        <Stat
          value={order > 0 ? order : '—'}
          label={t('l.groups.repetitions')}
          sub={order > 0
            ? t('l.groups.totalMoves', {
              order,
              len: parseSequence(seq).moves.length,
              total: order * parseSequence(seq).moves.length,
            })
            : t('l.groups.enterValid')}
        />
      </Card>

      <h3>{t('l.groups.subgroups')}</h3>
      <p><T k="l.groups.subgroupsBody" /></p>
      <p>{t('l.groups.cosetsBody')}</p>

      <Quiz
        id="groups-q1"
        question={t('l.groups.q1')}
        options={[t('l.groups.q1a'), t('l.groups.q1b'), t('l.groups.q1c'), t('l.groups.q1d')]}
        correct={0}
        explain={<p style={{ marginBottom: 0 }}>{t('l.groups.q1why')}</p>}
      />
    </LessonBody>
  );
}

/* ======================================================= 9. the ladder --- */

export function LessonLadder(): JSX.Element {
  const { t } = useI18n();
  const [stats, setStats] = useState<StageStats | null>(null);
  const [moves, setMoves] = useState<number[]>([]);
  const [hint, setHint] = useState<{ moves: number[]; distance: number; goal: string } | null>(null);
  const [scramble] = useState("R U2 F' L D B R' U F2 D'");

  const cube = useMemo(() => CubieCube.fromMoves(parseSequence(scramble).moves).applyMoves(moves), [scramble, moves]);
  const r = useMemo(() => report(cube), [cube]);

  useEffect(() => {
    let live = true;
    requestStageStats().then((x) => { if (live) setStats(x); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const askHint = async (stage: 'edge-orientation' | 'cross' | 'g1'): Promise<void> => {
    const res = await solveStage(faceletString(toFacelets(cube)), stage);
    setHint({ moves: res.moves, distance: res.distance, goal: res.goal });
  };

  return (
    <LessonBody>
      <p>{t('l.ladder.intro')}</p>

      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>{t('l.ladder.rung')}</th>
              <th>{t('l.ladder.generators')}</th>
              <th className="num">{t('l.ladder.size')}</th>
              <th>{t('l.ladder.meaning')}</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['G₀', 'U D L R F B', '4.3 × 10¹⁹', 'l.ladder.g0'],
              ['G₁', 'U D L R F2 B2', '2.1 × 10¹⁶', 'l.ladder.g1'],
              ['G₂', 'U D L2 R2 F2 B2', '1.95 × 10¹⁰', 'l.ladder.g2'],
              ['G₃', 'U2 D2 L2 R2 F2 B2', '663,552', 'l.ladder.g3'],
              ['G₄', '—', '1', 'l.ladder.g4'],
            ] as const).map(([name, gens, size, key]) => (
              <tr key={name}>
                <td className="mono-ltr">{name}</td>
                <td><bdi className="mono-ltr">{gens}</bdi></td>
                <td className="num">{size}</td>
                <td>{t(key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        <T k="l.ladder.kociemba" /> <a href="#/solver">{t('nav.solver')}</a>
      </p>

      {stats ? (
        <div className="grid two">
          <Card title={t('l.ladder.rungOne')} note={t('l.ladder.rungOneSub')}>
            <p>
              {t('l.ladder.rungOneBody', {
                n: stats.flip.size.toLocaleString('en-US'),
                d: stats.flip.diameter,
              })}
            </p>
            <Histogram data={stats.flip.histogram} />
          </Card>
          <Card title={t('l.ladder.humanRung')} note={t('l.ladder.humanRungSub')}>
            <p>
              {t('l.ladder.humanRungBody', {
                n: stats.cross.size.toLocaleString('en-US'),
                d: stats.cross.diameter,
              })}
            </p>
            <Histogram data={stats.cross.histogram} />
          </Card>
        </div>
      ) : null}

      <Card title={t('l.ladder.climb')} className="stack">
        <p style={{ marginBottom: 0 }}>
          <bdi className="mono-ltr">{scramble}</bdi> — {t('l.ladder.climbBody')}
        </p>
        <div className="split" style={{ gap: 14 }}>
          <Cube3D facelets={faceletString(toFacelets(cube))} interactive={false} height={250} />
          <div className="stack">
            <MovePad onMove={(m) => setMoves((x) => [...x, m])} keyboard={false} />
            <div className="row tight">
              <button
                className="btn small"
                onClick={() => setMoves((x) => x.slice(0, -1))}
                disabled={!moves.length}
              >
                {t('common.undo')}
              </button>
              <button className="btn small ghost" onClick={() => { setMoves([]); setHint(null); }}>
                {t('common.reset')}
              </button>
              <button className="btn small" onClick={() => askHint('edge-orientation')}>
                {t('l.ladder.optimalEo')}
              </button>
              <button className="btn small" onClick={() => askHint('g1')}>
                {t('l.ladder.optimalG1')}
              </button>
            </div>
            <div className="row" style={{ gap: 16 }}>
              <Stat value={`${r.orientedEdges}/12`} label={t('scan.edgesOriented')} />
              <Stat value={`${r.orientedCorners}/8`} label={t('scan.cornersOriented')} />
              <Stat value={`${r.sliceEdgesHome}/4`} label={t('scan.sliceHome')} />
            </div>
            {r.inG1 ? (
              <Callout title={t('l.ladder.inG1')}>
                <p style={{ margin: 0 }}><T k="l.ladder.inG1Body" /></p>
              </Callout>
            ) : null}
            {hint ? (
              <div>
                <div className="card-note" style={{ marginBottom: 4 }}>
                  {t('l.ladder.shortestTo', {
                    goal: t(`l.ladder.goal.${hint.goal}`),
                    n: hint.distance,
                  })}
                </div>
                <Sequence moves={hint.moves} />
                <button
                  className="btn small"
                  style={{ marginTop: 6 }}
                  onClick={() => { setMoves((x) => [...x, ...hint.moves]); setHint(null); }}
                >
                  {t('common.apply')}
                </button>
              </div>
            ) : null}
            <div className="card-note">{t('l.ladder.yourMoves', { n: moves.length })}</div>
          </div>
        </div>
      </Card>

      <Quiz
        id="ladder-q1"
        question={t('l.ladder.q1')}
        options={[t('l.ladder.q1a'), t('l.ladder.q1b'), t('l.ladder.q1c'), t('l.ladder.q1d')]}
        correct={1}
        explain={<p style={{ marginBottom: 0 }}>{t('l.ladder.q1why')}</p>}
      />
    </LessonBody>
  );
}

function Histogram({ data }: { data: number[] }): JSX.Element {
  const { t } = useI18n();
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60, direction: 'ltr' }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div
            title={`${v.toLocaleString('en-US')} · ${t('common.distance')} ${i}`}
            style={{ height: `${Math.max(2, (v / max) * 46)}px`, background: 'var(--accent)', borderRadius: '2px 2px 0 0' }}
          />
          <span style={{ fontSize: '0.6rem', color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>{i}</span>
        </div>
      ))}
    </div>
  );
}

/* ===================================================== 10. god's number --- */

export function LessonGodsNumber(): JSX.Element {
  const { t } = useI18n();
  const [pocket, setPocket] = useState<PocketStats | null>(null);
  useEffect(() => {
    let live = true;
    preparePocket()
      .then(requestPocketStats)
      .then((s) => { if (live) setPocket(s); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  return (
    <LessonBody>
      <p>{t('l.gods.intro')}</p>

      <h3>{t('l.gods.twoHalves')}</h3>
      <ul>
        <li>{t('l.gods.upper')}</li>
        <li>{t('l.gods.lower')}</li>
      </ul>

      <h3>{t('l.gods.closed')}</h3>
      <p><T k="l.gods.closedBody" /></p>

      <Callout title={t('l.gods.shortcut')}>
        <p style={{ marginBottom: 0 }}>{t('l.gods.shortcutBody')}</p>
      </Callout>

      {pocket ? (
        <Card title={t('l.gods.sameProof')} className="stack">
          <p>
            {t('l.gods.sameProofBody', {
              states: pocket.states.toLocaleString('en-US'),
              ratio: formatApprox(TOTAL_STATES / pocket.states),
              ms: pocket.millis,
            })}
          </p>
          <div className="row" style={{ gap: 20 }}>
            <Stat
              value={pocket.godsNumber}
              label={t('l.gods.pocketGod')}
              sub={t('l.gods.computedHere')}
            />
            <Stat
              value={pocket.histogram[pocket.godsNumber].toLocaleString('en-US')}
              label={t('l.gods.needAll')}
            />
            <Stat value={formatApprox(pocket.states)} label={t('l.gods.checked')} />
          </div>
          <p style={{ marginBottom: 0 }} className="card-note">{t('l.gods.sameCertainty')}</p>
          <a className="btn" href="#/graph">{t('l.gods.openAtlas')}</a>
        </Card>
      ) : null}

      <ConceptCheck
        promptId="gods-number"
        rubric={['jev.rubric.gods.1', 'jev.rubric.gods.2', 'jev.rubric.gods.3']}
      />

      <Quiz
        id="gods-q1"
        question={t('l.gods.q1')}
        options={[t('l.gods.q1a'), t('l.gods.q1b'), t('l.gods.q1c'), t('l.gods.q1d')]}
        correct={1}
        explain={<p style={{ marginBottom: 0 }}>{t('l.gods.q1why')}</p>}
      />
    </LessonBody>
  );
}

/* ================================================= 11. humans vs machines --- */

export function LessonHumanVsMachine(): JSX.Element {
  const { t } = useI18n();
  const max = Math.max(...METHODS.map((m) => m.typicalMoves));
  return (
    <LessonBody>
      <p>{t('l.human.intro')}</p>

      <h3>{t('l.human.whatComputer')}</h3>
      <ul>
        <li>{t('l.human.b1')}</li>
        <li>{t('l.human.b2')}</li>
        <li>{t('l.human.b3')}</li>
      </ul>

      <Card title={t('l.human.sameScramble')}>
        <div className="stack" style={{ gap: 10 }}>
          {METHODS.map((m) => (
            <div key={m.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '0.92rem' }}>{t(`method.${m.id}.name`)}</strong>
                <span className="card-note">{t('training.attemptMoves', { n: m.typicalMoves })}</span>
              </div>
              <div className="meter"><i style={{ width: `${(m.typicalMoves / max) * 100}%` }} /></div>
              <div className="card-note">{t(`method.${m.id}.why`)}</div>
            </div>
          ))}
        </div>
      </Card>

      <h3>{t('l.human.achievable')}</h3>
      <p>{t('l.human.achievableBody')}</p>
      <ul>
        <li>{t('l.human.a1')} <a href="#/scan">{t('nav.scan')}</a></li>
        <li>{t('l.human.a2')}</li>
        <li>{t('l.human.a3')}</li>
        <li>{t('l.human.a4')}</li>
      </ul>
      <p>
        {t('l.human.lastOne')} <a href="#/training">{t('nav.training')}</a>
      </p>

      <Quiz
        id="human-q1"
        question={t('l.human.q1')}
        options={[t('l.human.q1a'), t('l.human.q1b'), t('l.human.q1c'), t('l.human.q1d')]}
        correct={1}
        explain={<p style={{ marginBottom: 0 }}>{t('l.human.q1why')}</p>}
      />
    </LessonBody>
  );
}
