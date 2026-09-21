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
import { LANGUAGES, useI18n } from './i18n/I18nProvider';

interface Route {
  id: string;
  /** i18n key for the label, so navigation translates with everything else. */
  labelKey: string;
  glyph: string;
  groupKey: string;
  element: () => JSX.Element;
}

const ROUTES: Route[] = [
  { id: 'atlas', labelKey: 'nav.atlas', glyph: '◎', groupKey: 'nav.group.start', element: () => <AtlasPage /> },
  { id: 'course', labelKey: 'nav.course', glyph: '▤', groupKey: 'nav.group.start', element: () => <CoursePage /> },
  { id: 'lab', labelKey: 'nav.lab', glyph: '▣', groupKey: 'nav.group.lab', element: () => <LabPage /> },
  { id: 'graph', labelKey: 'nav.graph', glyph: '✳', groupKey: 'nav.group.lab', element: () => <GraphPage /> },
  { id: 'solver', labelKey: 'nav.solver', glyph: '⟲', groupKey: 'nav.group.lab', element: () => <SolverPage /> },
  { id: 'scan', labelKey: 'nav.scan', glyph: '◧', groupKey: 'nav.group.practice', element: () => <ScanPage /> },
  { id: 'training', labelKey: 'nav.training', glyph: '◈', groupKey: 'nav.group.practice', element: () => <TrainingPage /> },
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
  const { t } = useI18n();
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
    const out: { key: string; items: Route[] }[] = [];
    for (const r of ROUTES) {
      let g = out.find((x) => x.key === r.groupKey);
      if (!g) { g = { key: r.groupKey, items: [] }; out.push(g); }
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
              <div className="brand-title">{t('app.title')}</div>
              <div className="brand-sub">{t('app.tagline')}</div>
            </div>
          </div>
        </div>
        <nav className="nav">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="nav-group-title">{t(g.key)}</div>
              {g.items.map((r) => (
                <button
                  key={r.id}
                  className="nav-item"
                  aria-current={r.id === active.id}
                  onClick={() => go(r.id)}
                >
                  <span className="glyph">{r.glyph}</span>
                  {t(r.labelKey)}
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
          <LanguagePicker />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="card-note">{t('chrome.theme')}</span>
            <div className="seg">
              {(['auto', 'light', 'dark'] as const).map((mode) => (
                <button key={mode} aria-pressed={theme === mode} onClick={() => actions.setTheme(mode)}>
                  {t(`chrome.theme.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="mobile-nav">
          {/* The sidebar is hidden on narrow screens, so the language and
              theme controls that live in it have to appear here too - a
              language selector nobody can reach on a phone is not a selector. */}
          <LanguagePicker compact />
          {ROUTES.map((r) => (
            <button
              key={r.id}
              className="btn small"
              aria-pressed={r.id === active.id}
              style={r.id === active.id ? { background: 'var(--accent-soft)', fontWeight: 600 } : undefined}
              onClick={() => go(r.id)}
            >
              {t(r.labelKey)}
            </button>
          ))}
        </div>
        <div className="page">{active.element()}</div>
      </main>
    </div>
  );
}

function TableStatus({ ready, stage, fraction }: { ready: boolean; stage: string; fraction: number }): JSX.Element {
  const { t } = useI18n();
  if (ready) {
    return (
      <div className="row" style={{ gap: 6 }}>
        <span className="tag ok">{t('chrome.solverReady')}</span>
      </div>
    );
  }
  return (
    <div>
      <div className="card-note" style={{ marginBottom: 4 }}>
        {t('chrome.buildingTables', { stage })}
      </div>
      <div className="meter"><i style={{ width: `${Math.round(fraction * 100)}%` }} /></div>
    </div>
  );
}

/**
 * Language selector.
 *
 * Switching language only changes which dictionary strings are read from and
 * the document direction. It touches no cube state, no move list, no lesson
 * progress and no solver result, so anything in flight survives the switch.
 */
function LanguagePicker({ compact = false }: { compact?: boolean }): JSX.Element {
  const { t, lang, setLang } = useI18n();
  const seg = (
    <div className="seg" role="group" aria-label={t('chrome.language')}>
      {LANGUAGES.map((l) => (
        <button
          key={l.id}
          data-lang={l.id}
          aria-pressed={lang === l.id}
          lang={l.id}
          onClick={() => setLang(l.id)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
  if (compact) return seg;
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className="card-note">{t('chrome.language')}</span>
      {seg}
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
