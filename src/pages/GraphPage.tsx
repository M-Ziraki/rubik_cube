import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube3D } from '../components/Cube3D';
import { TransportDock } from '../components/TransportDock';
import { PocketNet } from '../components/PocketNet';
import { GraphCanvas } from '../graph/GraphCanvas';
import { ShellCanvas } from '../graph/ShellCanvas';
import { Callout, Card, Sequence, Stat, formatApprox } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { actions, currentFacelets, useAppState } from '../state/store';
import {
  preparePocket, requestNeighbourhood, requestPocketStats, requestScramble, scramblePocket, solvePocketState,
} from '../solver/client';
import type { GraphPayload, PocketStats } from '../solver/protocol';
import { MOVE_NAMES, N_MOVES } from '../cube/defs';
import { HTM_DISTANCE_DISTRIBUTION, TOTAL_STATES } from '../data/facts';
import { player } from '../state/player';
import { useI18n } from '../i18n/I18nProvider';
import { Tabs, TabPanel } from '../components/Tabs';
import { usePublishAssistantContext } from '../jev/assistantContext';
import { go } from '../state/navigation';

type View = 'near' | 'pocket' | 'growth';

export function GraphPage(): JSX.Element {
  // What the study panel offers from this page. The panel itself always
  // carries the universal help; these are the jumps that only make sense
  // from here.
  usePublishAssistantContext(() => ({ labelKey: 'nav.graph', actions: [
      { id: 'lesson-graph', labelKey: 'assist.act.graphLesson', noteKey: 'assist.act.graphLesson.note',
        run: () => go('#/course/graph') },
      { id: 'lesson-distance', labelKey: 'assist.act.distanceLesson', noteKey: 'assist.act.distanceLesson.note',
        run: () => go('#/course/distance') },
      { id: 'try-atlas', labelKey: 'assist.act.openAtlas', noteKey: 'assist.act.openAtlas.note',
        run: () => go('#/atlas') },
    ] }), []);

  const { t } = useI18n();
  const [view, setView] = useState<View>('near');
  return (
    <>
      <PageHeader
        eyebrow={t('graph.eyebrow')}
        title={t('graph.title')}
        lede={t('graph.lede')}
      >
          <Tabs
            value={view}
            onChange={setView}
            label={t('graph.tabs')}
            tabs={[
              { id: 'near', label: t('graph.tab.near') },
              { id: 'pocket', label: t('graph.tab.pocket') },
              { id: 'growth', label: t('graph.tab.growth') },
            ]}
          />
      </PageHeader>
      <TabPanel>{view === 'near' ? <NeighbourhoodView /> : view === 'pocket' ? <PocketView /> : <GrowthView />}</TabPanel>
    </>
  );
}

/* ---------------------------------------------------------- neighbourhood --- */

function NeighbourhoodView(): JSX.Element {
  const { t } = useI18n();
  const state = useAppState((s) => s);
  const facelets = useMemo(
    () => currentFacelets(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.origin, state.cursor, state.moves],
  );
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [depth, setDepth] = useState(2);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const token = useRef(0);

  useEffect(() => {
    if (!state.tablesReady) return;
    const id = ++token.current;
    setBusy(true);
    requestNeighbourhood(facelets, depth, depth >= 3 ? 4000 : 1000)
      .then((g) => { if (id === token.current) { setGraph(g); setSelected(null); } })
      .catch(() => undefined)
      .finally(() => { if (id === token.current) setBusy(false); });
  }, [facelets, depth, state.tablesReady]);

  const pathToSelected = useMemo(() => {
    if (!graph || selected === null) return [];
    const chain: number[] = [];
    let cur = selected;
    while (cur >= 0) { chain.unshift(cur); cur = graph.nodes[cur].parent; }
    return chain;
  }, [graph, selected]);

  const movesToSelected = useMemo(() => {
    if (!graph || selected === null) return [];
    const out: number[] = [];
    let cur = selected;
    while (cur >= 0 && graph.nodes[cur].parent >= 0) {
      out.unshift(graph.nodes[cur].viaMove);
      cur = graph.nodes[cur].parent;
    }
    return out;
  }, [graph, selected]);

  const duplicates = useMemo(() => {
    if (!graph) return 0;
    // How many of the edges lead somewhere already reachable more cheaply?
    return graph.edges.length - (graph.nodes.length - 1);
  }, [graph]);

  return (
    <div className="split">
      <div className="stack">
        <Card
          title={t('graph.explore')}
          note={graph
            ? t('graph.exploreSub', { nodes: graph.nodes.length, edges: graph.edges.length })
            : t('common.building')}
          actions={(
            <div className="row tight">
              <div className="seg">
                {[1, 2, 3].map((d) => (
                  <button key={d} aria-pressed={depth === d} onClick={() => setDepth(d)}>{d}</button>
                ))}
              </div>
              <button
                className="btn small"
                onClick={async () => {
                  player.yieldToUser();
                  const r = await requestScramble(12, false);
                  actions.setPosition(r.facelets, r.moves);
                }}
              >
                {t('graph.newPosition')}
              </button>
            </div>
          )}
        >
          {busy && !graph ? <div className="shimmer" style={{ height: 460 }} /> : (
            <GraphCanvas
              graph={graph}
              height={460}
              path={pathToSelected}
              selected={selected}
              onSelect={(n) => setSelected(n.id)}
              caption={t('graph.caption')}
            />
          )}
        </Card>

        <Card title={t('graph.whyNot18')}>
          <p>{t('graph.whyNot18.p1')}</p>
          <p style={{ marginBottom: 0 }}>
            {duplicates > 0
              ? t('graph.whyNot18.p2', { n: duplicates })
              : t('graph.whyNot18.p2none')}
          </p>
        </Card>
      </div>

      <div className="stack">
        <Card
          title={t('graph.selected')}
          note={selected === null
            ? t('graph.selectedNone')
            : t('graph.movesAway', { n: movesToSelected.length })}
        >
          {selected !== null && graph ? (
            <>
              <Cube3D facelets={graph.nodes[selected].facelets} interactive={false} />
              <div style={{ marginTop: 10 }}>
                <div className="card-note" style={{ marginBottom: 4 }}>{t('graph.routeFromCentre')}</div>
                <Sequence moves={movesToSelected} />
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn"
                  onClick={() => { player.playSequence(movesToSelected); }}
                >
                  {t('graph.travelHere')}
                </button>
              </div>
            </>
          ) : (
            <EmptyState glyph="✳">{t('graph.selectedHelp')}</EmptyState>
          )}
        </Card>

        <Card title={t('graph.yourCube')}>
          <Cube3D onUserMove={(m) => { player.yieldToUser(); actions.applyMove(m); }} />
          {/* Walking to a neighbouring position is the whole lesson here, so
              it plays rather than jumps - and needs a control to replay it. */}
          <div style={{ marginTop: 12 }}>
            <TransportDock variant="inline" />
          </div>
        </Card>

        <Callout title={t('graph.reading')}>
          <p style={{ marginBottom: 0 }}>
            {t('graph.reading.body')}{' '}
            <bdi className="mono-ltr">U D U&rsquo; D&rsquo;</bdi>
          </p>
        </Callout>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- pocket --- */

function PocketView(): JSX.Element {
  const { t } = useI18n();
  const [stats, setStats] = useState<PocketStats | null>(null);
  const [building, setBuilding] = useState(false);
  const [distance, setDistance] = useState(0);
  const [solution, setSolution] = useState<number[]>([]);
  const [frames, setFrames] = useState<number[][]>([]);
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(7);

  useEffect(() => {
    let live = true;
    setBuilding(true);
    preparePocket()
      .then(() => requestPocketStats())
      .then((s) => { if (live) setStats(s); })
      .catch(() => undefined)
      .finally(() => { if (live) setBuilding(false); });
    return () => { live = false; };
  }, []);

  const shells = useMemo(
    () => (stats ? stats.histogram.map((count, d) => ({
      distance: d, count, exact: true,
      sample: d === 0 ? 1 : Math.max(4, Math.round(Math.log10(Math.max(10, count)) * 12)),
    })) : []),
    [stats],
  );

  const current = useMemo(
    () => Uint8Array.from(frames[Math.min(step, Math.max(0, frames.length - 1))] ?? new Array(24).fill(0)),
    [frames, step],
  );

  const scrambleTo = async (d: number): Promise<void> => {
    const r = await scramblePocket(d);
    setDistance(r.distance);
    setFrames([r.stickers]);
    setStep(0);
    const s = await solvePocketState(r.index);
    setSolution(s.moves);
    setFrames(s.frames);
  };

  return (
    <div className="split">
      <div className="stack">
        <Card
          title={t('graph.pocket.title')}
          note={stats
            ? t('graph.pocket.sub', { n: stats.states.toLocaleString('en-US'), ms: stats.millis })
            : t('common.building')}
        >
          {building || !stats ? <div className="shimmer" style={{ height: 420 }} /> : (
            <ShellCanvas
              spec={shells}
              height={420}
              highlight={distance || null}
              subtitle={t('graph.pocket.subtitle')}
            />
          )}
        </Card>

        {stats ? (
          <Callout title={t('graph.pocket.godTitle', { n: stats.godsNumber })}>
            <p>
              {t('graph.pocket.godBody', {
                states: stats.states.toLocaleString('en-US'),
                n: stats.godsNumber,
                count: stats.histogram[stats.godsNumber].toLocaleString('en-US'),
              })}
            </p>
            <p style={{ marginBottom: 0 }}>
              {t('graph.pocket.godBody2', { ratio: formatApprox(TOTAL_STATES / stats.states) })}
            </p>
          </Callout>
        ) : null}
      </div>

      <div className="stack">
        <Card
          title={t('graph.pocket.walk')}
          note={solution.length
            ? t('graph.pocket.fromSolved', { n: distance })
            : t('graph.pocket.pick')}
        >
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="field" style={{ flex: 1 }}>
              {t('graph.pocket.startAt', { n: target })}
              <input
                type="range" min={1} max={stats?.godsNumber ?? 11} value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
              />
            </label>
            <button className="btn primary" onClick={() => scrambleTo(target)} disabled={!stats}>
              {t('common.scramble')}
            </button>
          </div>

          <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
            <PocketNet
              stickers={current}
              size={26}
              label={t('graph.pocket.fromSolved', { n: Math.max(0, distance - step) })}
            />
          </div>

          {solution.length ? (
            <>
              <div className="row tight" style={{ marginBottom: 8 }}>
                <button className="btn small" onClick={() => setStep(0)}>⏮</button>
                <button className="btn small" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>◀</button>
                <button className="btn small" onClick={() => setStep((s) => Math.min(solution.length, s + 1))} disabled={step >= solution.length}>▶</button>
                <span className="card-note">{step} / {solution.length}</span>
              </div>
              <div className="seq">
                {solution.map((m, i) => (
                  <span
                    key={i}
                    className={`move-chip ${i < step ? 'done' : i === step ? 'current' : ''}`}
                    style={{ cursor: 'default' }}
                  >
                    {MOVE_NAMES[m]}
                  </span>
                ))}
              </div>
              <p className="card-note" style={{ marginTop: 10, marginBottom: 0 }}>
                {t('graph.pocket.optimalNote')}
              </p>
            </>
          ) : null}
        </Card>

        {stats ? (
          <Card title={t('graph.pocket.profile')}>
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th className="num">{t('solution.moves')}</th>
                    <th className="num">{t('common.positions')}</th>
                    <th>{t('graph.pocket.share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.histogram.map((count, d) => (
                    <tr key={d} style={d === distance ? { background: 'var(--accent-soft)' } : undefined}>
                      <td className="num">{d}</td>
                      <td className="num">{count.toLocaleString('en-US')}</td>
                      <td>
                        <div className="meter"><i style={{ width: `${(count / Math.max(...stats.histogram)) * 100}%` }} /></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- growth --- */

function GrowthView(): JSX.Element {
  const { t } = useI18n();
  const rows = HTM_DISTANCE_DISTRIBUTION;
  const [focus, setFocus] = useState<number | null>(null);
  const maxLog = Math.log10(Math.max(...rows.map((r) => r.count)));

  return (
    <div className="stack">
      <Card title={t('graph.growth.title')} note={t('graph.growth.sub')}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 200, marginBottom: 10 }}>
          {rows.map((r) => (
            <div
              key={r.distance}
              onMouseEnter={() => setFocus(r.distance)}
              onMouseLeave={() => setFocus(null)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}
            >
              <div
                title={`${r.count.toLocaleString('en-US')} ${t('common.positions')}`}
                style={{
                  width: '100%',
                  height: `${Math.max(2, (Math.log10(Math.max(1, r.count)) / maxLog) * 170)}px`,
                  background: r.exact ? 'var(--accent)' : 'var(--warn)',
                  opacity: focus === null || focus === r.distance ? 1 : 0.4,
                  borderRadius: '3px 3px 0 0',
                }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>{r.distance}</span>
            </div>
          ))}
        </div>
        <div className="row">
          <span className="tag ok">{t('graph.growth.exact')}</span>
          <span className="tag warn">{t('graph.growth.estimates')}</span>
          {focus !== null ? (
            <span className="card-note">
              {t('graph.growth.focus', {
                d: focus,
                n: rows[focus].count.toLocaleString('en-US'),
                pct: ((rows[focus].count / TOTAL_STATES) * 100).toPrecision(3),
              })}
            </span>
          ) : null}
        </div>
      </Card>

      <div className="grid two">
        <Card title={t('graph.branching')}>
          <div className="row" style={{ gap: 20 }}>
            <Stat
              value={N_MOVES}
              label={t('graph.branching.available')}
              sub={t('graph.branching.availableSub')}
            />
            <Stat
              value="13.35"
              label={t('graph.branching.effective')}
              sub={t('graph.branching.effectiveSub')}
            />
          </div>
          <p style={{ marginTop: 12, marginBottom: 0 }}>{t('graph.branching.body')}</p>
        </Card>

        <Card title={t('graph.why20')}>
          <p>{t('graph.why20.p1')}</p>
          <p style={{ marginBottom: 0 }}>{t('graph.why20.p2')}</p>
        </Card>
      </div>
    </div>
  );
}
