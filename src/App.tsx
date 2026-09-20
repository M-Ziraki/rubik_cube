import { useEffect, useMemo, useState } from 'react';
import { actions, useAppState } from './state/store';
import { prepareTables } from './solver/client';
import { AtlasPage } from './pages/AtlasPage';
import { LabPage } from './pages/LabPage';
import { GraphPage } from './pages/GraphPage';
import { CoursePage } from './pages/CoursePage';
import { SolverPage } from './pages/SolverPage';
import { ScanPage } from './pages/ScanPage';
import { TrainingPage } from './pages/TrainingPage';
import { LESSONS } from './lessons/registry';

interface Route {
  id: string;
  label: string;
  glyph: string;
  group: string;
  element: () => JSX.Element;
}

const ROUTES: Route[] = [
  { id: 'atlas', label: 'The Atlas', glyph: '◎', group: 'Start here', element: () => <AtlasPage /> },
  { id: 'course', label: 'Course', glyph: '▤', group: 'Start here', element: () => <CoursePage /> },
  { id: 'lab', label: 'Cube lab', glyph: '▣', group: 'Laboratory', element: () => <LabPage /> },
  { id: 'graph', label: 'State space', glyph: '✳', group: 'Laboratory', element: () => <GraphPage /> },
  { id: 'solver', label: 'Solvers', glyph: '⟲', group: 'Laboratory', element: () => <SolverPage /> },
  { id: 'scan', label: 'Your cube', glyph: '◧', group: 'Practice', element: () => <ScanPage /> },
  { id: 'training', label: 'Training', glyph: '◈', group: 'Practice', element: () => <TrainingPage /> },
];

function useHashRoute(): [string, (id: string) => void] {
  const read = (): string => {
    const raw = window.location.hash.replace(/^#\/?/, '').split('/')[0];
    return ROUTES.some((r) => r.id === raw) ? raw : 'atlas';
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onHash = (): void => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (id: string): void => { window.location.hash = `#/${id}`; };
  return [route, go];
}

export function App(): JSX.Element {
  const [route, go] = useHashRoute();
  const tablesReady = useAppState((s) => s.tablesReady);
  const stage = useAppState((s) => s.tableStage);
  const fraction = useAppState((s) => s.tableFraction);
  const theme = useAppState((s) => s.theme);
  const lessonsDone = useAppState((s) => s.progress.lessonsDone);

  useEffect(() => {
    let cancelled = false;
    prepareTables((st, fr) => { if (!cancelled) actions.setTables(false, st, fr); })
      .then(() => { if (!cancelled) actions.setTables(true, 'ready', 1); })
      .catch((err: Error) => { if (!cancelled) actions.setTables(false, `failed: ${err.message}`, 0); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const out: { name: string; items: Route[] }[] = [];
    for (const r of ROUTES) {
      let g = out.find((x) => x.name === r.group);
      if (!g) { g = { name: r.group, items: [] }; out.push(g); }
      g.items.push(r);
    }
    return out;
  }, []);

  const active = ROUTES.find((r) => r.id === route) ?? ROUTES[0];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <CubeGlyph />
            <div>
              <div className="brand-title">Cube Atlas</div>
              <div className="brand-sub">Graph theory, by hand</div>
            </div>
          </div>
        </div>
        <nav className="nav">
          {groups.map((g) => (
            <div key={g.name}>
              <div className="nav-group-title">{g.name}</div>
              {g.items.map((r) => (
                <button
                  key={r.id}
                  className="nav-item"
                  aria-current={r.id === active.id}
                  onClick={() => go(r.id)}
                >
                  <span className="glyph">{r.glyph}</span>
                  {r.label}
                  {r.id === 'course' ? (
                    <span className="nav-badge">{lessonsDone.length}/{LESSONS.length}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <TableStatus ready={tablesReady} stage={stage} fraction={fraction} />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="card-note">Theme</span>
            <div className="seg">
              {(['auto', 'light', 'dark'] as const).map((t) => (
                <button key={t} aria-pressed={theme === t} onClick={() => actions.setTheme(t)}>
                  {t === 'auto' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="mobile-nav">
          {ROUTES.map((r) => (
            <button
              key={r.id}
              className="btn small"
              aria-pressed={r.id === active.id}
              style={r.id === active.id ? { background: 'var(--accent-soft)', fontWeight: 600 } : undefined}
              onClick={() => go(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="page">{active.element()}</div>
      </main>
    </div>
  );
}

function TableStatus({ ready, stage, fraction }: { ready: boolean; stage: string; fraction: number }): JSX.Element {
  if (ready) {
    return (
      <div className="row" style={{ gap: 6 }}>
        <span className="tag ok">solver ready</span>
      </div>
    );
  }
  return (
    <div>
      <div className="card-note" style={{ marginBottom: 4 }}>
        Building lookup tables · {stage}
      </div>
      <div className="meter"><i style={{ width: `${Math.round(fraction * 100)}%` }} /></div>
    </div>
  );
}

function CubeGlyph(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <g fill="none" strokeWidth="1.4" stroke="currentColor" opacity="0.85">
        <path d="M14 2.6 24.6 8 14 13.4 3.4 8 14 2.6Z" />
        <path d="M3.4 8v12L14 25.4V13.4" />
        <path d="M24.6 8v12L14 25.4" />
      </g>
      <circle cx="14" cy="8" r="1.7" fill="var(--f)" />
      <circle cx="8.4" cy="16.4" r="1.7" fill="var(--r)" />
      <circle cx="19.6" cy="16.4" r="1.7" fill="var(--b)" />
    </svg>
  );
}
