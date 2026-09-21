import { useEffect, useState } from 'react';
import { CubeTask, LessonBody, NumberQuiz, Quiz } from './framework';
import { Callout, Card, Sequence, Stat, formatApprox } from '../components/ui';
import { GraphCanvas } from '../graph/GraphCanvas';
import { Cube3D } from '../components/Cube3D';
import { requestNeighbourhood, requestPocketStats, preparePocket } from '../solver/client';
import type { GraphPayload, PocketStats } from '../solver/protocol';
import { SOLVED_FACELETS } from '../cube/defs';
import { CubieCube } from '../cube/cubie';
import { faceletString, toFacelets } from '../cube/facelet';
import { parseSequence } from '../cube/notation';
import { HTM_DISTANCE_DISTRIBUTION, TOTAL_STATES } from '../data/facts';
import { T, useI18n, type Translate } from '../i18n/I18nProvider';

/* ============================================================== 4. graph --- */

export function LessonGraph(): JSX.Element {
  const { t } = useI18n();
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [depth, setDepth] = useState(2);

  useEffect(() => {
    let live = true;
    requestNeighbourhood(SOLVED_FACELETS, depth, depth >= 3 ? 3500 : 900)
      .then((g) => { if (live) setGraph(g); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [depth]);

  return (
    <LessonBody>
      <p>{t('l.graph.intro')}</p>
      <Callout title={t('l.graph.asGraph')}>
        <ul style={{ marginBottom: 0 }}>
          <li>{t('l.graph.b1')}</li>
          <li>{t('l.graph.b2')}</li>
          <li>{t('l.graph.b3')}</li>
          <li>{t('l.graph.b4')}</li>
        </ul>
      </Callout>

      <p><T k="l.graph.properties" /></p>

      <Card title={t('l.graph.rings')} note={t('l.graph.ringsSub')}>
        <div className="seg" style={{ marginBottom: 10 }}>
          {[1, 2, 3].map((d) => (
            <button key={d} aria-pressed={depth === d} onClick={() => setDepth(d)}>
              {t('l.graph.within', { d })}
            </button>
          ))}
        </div>
        <GraphCanvas graph={graph} height={380} caption={t('l.graph.hoverDot')} />
      </Card>

      <h3>{t('l.graph.smaller')}</h3>
      <p>{t('l.graph.smallerBody')}</p>
      <ul>
        <li><T k="l.graph.shrink1" /></li>
        <li><T k="l.graph.shrink2" /></li>
      </ul>
      <p>{t('l.graph.branching')}</p>

      <NumberQuiz
        id="graph-q1"
        question={<p style={{ marginBottom: 0 }}>{t('l.graph.q1')}</p>}
        answer={3240}
        explain={<p style={{ marginBottom: 0 }}>{t('l.graph.q1why')}</p>}
      />

      <Quiz
        id="graph-q2"
        question={t('l.graph.q2')}
        options={[t('l.graph.q2a'), t('l.graph.q2b'), t('l.graph.q2c'), t('l.graph.q2d')]}
        correct={1}
        explain={<p style={{ marginBottom: 0 }}>{t('l.graph.q2why')}</p>}
      />
    </LessonBody>
  );
}

/* =========================================================== 5. distance --- */

export function LessonDistance(): JSX.Element {
  const { t } = useI18n();
  const [focus, setFocus] = useState(18);
  const row = HTM_DISTANCE_DISTRIBUTION[focus];

  return (
    <LessonBody>
      <p>{t('l.distance.intro')}</p>

      <Card title={t('l.distance.distributed')} className="stack">
        <input
          type="range" min={0} max={20} value={focus}
          onChange={(e) => setFocus(Number(e.target.value))}
        />
        <div className="row" style={{ gap: 20 }}>
          <Stat value={focus} label={t('l.distance.movesFromSolved')} />
          <Stat
            value={formatApprox(row.count)}
            label={t('common.positions')}
            sub={row.exact ? t('common.exact') : t('common.estimate')}
          />
          <Stat
            value={`${((row.count / TOTAL_STATES) * 100).toPrecision(3)}%`}
            label={t('l.distance.ofWhole')}
          />
        </div>
        <div className="meter"><i style={{ width: `${(row.count / 2.9e19) * 100}%` }} /></div>
      </Card>

      <h3>{t('l.distance.threeFacts')}</h3>
      <ul>
        <li>{t('l.distance.fact1')}</li>
        <li>{t('l.distance.fact2')}</li>
        <li>{t('l.distance.fact3')}</li>
      </ul>

      <Callout title={t('l.distance.shape')}>
        <p style={{ marginBottom: 0 }}>{t('l.distance.shapeBody')}</p>
      </Callout>

      <Quiz
        id="distance-q1"
        question={t('l.distance.q1')}
        options={[t('l.distance.q1a'), t('l.distance.q1b'), t('l.distance.q1c'), t('l.distance.q1d')]}
        correct={2}
        explain={<p style={{ marginBottom: 0 }}>{t('l.distance.q1why')}</p>}
      />
    </LessonBody>
  );
}

/* ============================================================= 6. search --- */

export function LessonSearch(): JSX.Element {
  const { t } = useI18n();
  const [depth, setDepth] = useState(10);
  const bf = 13.35;
  const nodes = Math.pow(bf, depth);
  const perSecond = 20e6;

  return (
    <LessonBody>
      <p>{t('l.search.intro')}</p>

      <h3>{t('l.search.bfs')}</h3>
      <p>{t('l.search.bfsBody')}</p>

      <h3>{t('l.search.dfs')}</h3>
      <p>{t('l.search.dfsBody')}</p>

      <h3>{t('l.search.ida')}</h3>
      <p>{t('l.search.idaBody')}</p>

      <Card title={t('l.search.cost')} className="stack">
        <label className="field">
          {t('l.search.depth', { n: depth })}
          <input
            type="range" min={1} max={20} value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
          />
        </label>
        <div className="row" style={{ gap: 20 }}>
          <Stat
            value={formatApprox(nodes)}
            label={t('l.search.toVisit')}
            sub={t('l.search.atBranching')}
          />
          <Stat
            value={humanTime(nodes / perSecond, t)}
            label={t('l.search.perSecond')}
            sub={t('l.search.generous')}
          />
        </div>
        {depth >= 14 ? (
          <Callout kind="warn" title={t('l.search.whyHeuristics')}>
            <p style={{ marginBottom: 0 }}>{t('l.search.whyHeuristicsBody')}</p>
          </Callout>
        ) : null}
      </Card>

      <h3>{t('l.search.middle')}</h3>
      <p>{t('l.search.middleBody')}</p>

      <Quiz
        id="search-q1"
        question={t('l.search.q1')}
        options={[t('l.search.q1a'), t('l.search.q1b'), t('l.search.q1c'), t('l.search.q1d')]}
        correct={1}
        explain={<p style={{ marginBottom: 0 }}>{t('l.search.q1why')}</p>}
      />
    </LessonBody>
  );
}

function humanTime(seconds: number, t: Translate): string {
  if (seconds < 1) return t('time.ms', { n: (seconds * 1000).toFixed(0) });
  if (seconds < 90) return t('time.s', { n: seconds.toFixed(1) });
  if (seconds < 5400) return t('time.min', { n: (seconds / 60).toFixed(1) });
  if (seconds < 172800) return t('time.hours', { n: (seconds / 3600).toFixed(1) });
  if (seconds < 3.15e9) return t('time.days', { n: (seconds / 86400).toFixed(1) });
  return t('time.years', { n: (seconds / 3.15e7).toExponential(1) });
}

/* ========================================================= 7. heuristics --- */

export function LessonHeuristics(): JSX.Element {
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
      <p>{t('l.heur.intro')}</p>

      <Callout title={t('l.heur.trick')}>
        <p style={{ marginBottom: 0 }}>{t('l.heur.trickBody')}</p>
      </Callout>

      <h3>{t('l.heur.example')}</h3>
      <p>{t('l.heur.exampleBody1')}</p>
      <p>{t('l.heur.exampleBody2')}</p>

      <h3>{t('l.heur.stacking')}</h3>
      <p>{t('l.heur.stackingBody')}</p>

      {pocket ? (
        <Card title={t('l.heur.wholeTable')} className="stack">
          <p style={{ marginBottom: 0 }}>
            {t('l.heur.wholeTableBody', {
              states: pocket.states.toLocaleString('en-US'),
              ms: pocket.millis,
              n: pocket.godsNumber,
            })}
          </p>
          <div className="row tight">
            {pocket.histogram.map((c, d) => (
              <span
                key={d}
                className="tag"
                title={`${c.toLocaleString('en-US')} ${t('common.positions')}`}
              >
                {d}: {formatApprox(c)}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Quiz
        id="heuristics-q1"
        question={t('l.heur.q1')}
        options={[t('l.heur.q1a'), t('l.heur.q1b'), t('l.heur.q1c'), t('l.heur.q1d')]}
        correct={1}
        explain={<p style={{ marginBottom: 0 }}>{t('l.heur.q1why')}</p>}
      />

      <CubeTask
        id="heuristics-t1"
        title={t('l.heur.task')}
        brief={<p>{t('l.heur.taskBrief')}</p>}
        setup="F R U' B L2 F'"
        check={(c) => {
          let flipped = 0;
          for (let i = 0; i < 12; i++) if (c.eo[i]) flipped++;
          return flipped === 0 ? null : t('l.heur.stillMisoriented', { n: flipped });
        }}
        hint={<p style={{ margin: 0 }}>{t('l.heur.taskHint')}</p>}
      />
    </LessonBody>
  );
}

/* ------------------------------------------------------------- example --- */

export function exampleCube(scramble: string): string {
  return faceletString(toFacelets(CubieCube.fromMoves(parseSequence(scramble).moves)));
}

export { Cube3D, Sequence };
