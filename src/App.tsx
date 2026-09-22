/**
 * The shell: navigation, global affordances, and nothing else.
 *
 * Three things changed here, and all three came out of watching the rendered
 * application rather than reading it.
 *
 * The sections were named after the machinery ("Laboratory", "Practice") and
 * grouped by what built them, so "The Atlas" and "Cube lab" sat in different
 * groups while being the same kind of thing. They are now named after what a
 * learner wants - learn it, explore it, practise it - and a one-line
 * description follows every label anywhere there is room for one.
 *
 * The phone had a horizontally scrolling row of nine identical pills, of which
 * three were visible and none looked current. It now has a tab bar with the
 * four destinations that matter and a sheet for the rest, which is the
 * convention every phone user already knows.
 *
 * And the assistant was nowhere. It is now in the same corner of every page.
 */

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
import { LearningLabPage } from './pages/LearningLabPage';
import { SettingsPage } from './pages/SettingsPage';
import { LESSONS } from './lessons/registry';
import { LANGUAGES, useI18n } from './i18n/I18nProvider';
import { jevConfig, jevActive, useJevConfig } from './jev/config';
import { probeJevStatus } from './jev/client';
import { ROUTES, SECTIONS, go, routeById, useRoute, type RouteDef } from './state/navigation';
import { session, useSession } from './state/session';
import { useNarrow } from './state/useMediaQuery';
import { AssistantDock } from './components/Assistant';
import { CommandPalette } from './components/CommandPalette';
import { Sheet } from './components/Sheet';
import { CubeMark, FaceletLoader } from './components/CubeMark';

const PAGES: Record<string, () => JSX.Element> = {
  atlas: () => <AtlasPage />,
  course: () => <CoursePage />,
  lab: () => <LabPage />,
  graph: () => <GraphPage />,
  solver: () => <SolverPage />,
  scan: () => <ScanPage />,
  training: () => <TrainingPage />,
  'ai-lab': () => <LearningLabPage />,
  settings: () => <SettingsPage />,
};

export function App(): JSX.Element {
  const { t } = useI18n();
  const route = useRoute();
  const tablesReady = useAppState((s) => s.tablesReady);
  const fraction = useAppState((s) => s.tableFraction);
  const lessonsDone = useAppState((s) => s.progress.lessonsDone);
  const [moreOpen, setMoreOpen] = useState(false);
  /*
   * On a wide screen the study panel is docked, not overlaid: you can keep
   * turning the cube while you ask about it, which is the entire point of a
   * companion. The shell reserves the width so nothing sits underneath it -
   * a panel that floats over the work it is discussing looks like a modal
   * that has forgotten to block, and that ambiguity was being read as a bug.
   */
  const narrow = useNarrow();
  const assistantOpen = useSession((x) => x.assistantOpen);
  const docked = assistantOpen && !narrow;

  // One cheap request to learn whether the server holds a key. It makes no
  // upstream call, costs nothing, and is the only request the application
  // sends without being asked - guessing instead would mean showing the wrong
  // configuration state on every page.
  useEffect(() => {
    const controller = new AbortController();
    probeJevStatus(controller.signal)
      .then((s) => jevConfig.setServerStatus(s.serverKey, s.model))
      .catch(() => jevConfig.markProbed());
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    prepareTables((st, fr) => { if (!cancelled) actions.setTables(false, st, fr); })
      .then(() => { if (!cancelled) actions.setTables(true, 'ready', 1); })
      .catch((err: Error) => { if (!cancelled) actions.setTables(false, `failed: ${err.message}`, 0); });
    return () => { cancelled = true; };
  }, []);

  // Moving to another page should start it at the top, and should close the
  // "more" sheet that was used to get there.
  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [route]);

  const sections = useMemo(
    () => SECTIONS.map((id) => ({ id, items: ROUTES.filter((r) => r.section === id) }))
      .filter((s) => s.items.length),
    [],
  );

  const active = routeById(route);
  const primary = ROUTES.filter((r) => r.primary);
  const secondary = ROUTES.filter((r) => !r.primary);

  return (
    <div className="app" data-assistant={docked ? 'docked' : undefined}>
      <a className="skip-link" href="#main">{t('chrome.skip')}</a>

      <aside className="sidebar" data-overlay-blocks>
        <div className="brand">
          <button className="brand-mark" onClick={() => go('#/atlas')}>
            <CubeMark size={28} />
            <span>
              <span className="brand-title">{t('app.title')}</span>
              <span className="brand-sub">{t('app.tagline')}</span>
            </span>
          </button>
        </div>
        <nav className="nav" aria-label={t('chrome.primaryNav')}>
          {sections.map((s) => (
            <div key={s.id}>
              <div className="nav-group-title">{t(`nav.section.${s.id}`)}</div>
              {s.items.map((r) => (
                <NavItem
                  key={r.id}
                  route={r}
                  active={r.id === active.id}
                  badge={r.id === 'course' ? `${lessonsDone.length}/${LESSONS.length}` : undefined}
                />
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="btn ghost small palette-hint" onClick={() => session.setPaletteOpen(true)}>
            <span>{t('palette.title')}</span>
            <kbd className="mono-ltr">Ctrl K</kbd>
          </button>
          <TableStatus ready={tablesReady} fraction={fraction} />
          <JevStatus />
          <LanguagePicker />
          <ThemePicker />
        </div>
      </aside>

      {/*
        A slim bar for the widths where the sidebar is not there.
        It carries the three things the sidebar was carrying that a learner
        needs at any moment and cannot find by scrolling: the way home, which
        section they are in, and the language. Everything else in the sidebar
        is reachable from the tab bar or from "More".
      */}
      <div className="topbar" data-overlay-blocks>
        <button className="topbar-home" onClick={() => go('#/atlas')} aria-label={t('app.title')}>
          <CubeMark size={26} />
        </button>
        <span className="topbar-where">
          <span className="card-note">{t(`nav.section.${active.section}`)}</span>
          <strong>{t(active.labelKey)}</strong>
        </span>
        <LanguagePicker compact />
      </div>

      <main className="main" id="main" tabIndex={-1} data-overlay-blocks>
        <div className={`page page-${active.kind}`}>{(PAGES[active.id] ?? PAGES.atlas)()}</div>
        <div className="tabbar-spacer" aria-hidden="true" />
      </main>

      {/* The phone's navigation. Four destinations, always visible, with the
          current one unmistakable; everything else behind one more tap. */}
      <nav className="tabbar" aria-label={t('chrome.primaryNav')} data-overlay-blocks>
        {primary.map((r) => (
          <button
            key={r.id}
            className="tab"
            aria-current={r.id === active.id}
            onClick={() => go(`#/${r.id}`)}
          >
            <span className="tab-glyph" aria-hidden="true">{r.glyph}</span>
            <span className="tab-label">{t(r.labelKey)}</span>
          </button>
        ))}
        <button
          className="tab"
          aria-expanded={moreOpen}
          aria-current={secondary.some((r) => r.id === active.id)}
          onClick={() => setMoreOpen(true)}
        >
          <span className="tab-glyph" aria-hidden="true">⋯</span>
          <span className="tab-label">{t('chrome.more')}</span>
        </button>
      </nav>

      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        label={t('chrome.more')}
        className="more-sheet"
      >
        <header className="assistant-head">
          <div className="card-title">{t('chrome.more')}</div>
          <button className="btn ghost icon" onClick={() => setMoreOpen(false)} aria-label={t('common.close')}>✕</button>
        </header>
        <div className="more-list">
          {secondary.map((r) => (
            <button key={r.id} className="btn block" onClick={() => go(`#/${r.id}`)}>
              <span className="assistant-action-label">
                <span className="glyph" aria-hidden="true">{r.glyph}</span> {t(r.labelKey)}
              </span>
              <span className="card-note">{t(r.blurbKey)}</span>
            </button>
          ))}
        </div>
        <div className="more-foot">
          <LanguagePicker compact />
          <ThemePicker compact />
        </div>
      </Sheet>

      <AssistantDock />
      <CommandPalette />
    </div>
  );
}

function NavItem({ route, active, badge }: {
  route: RouteDef; active: boolean; badge?: string;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <button
      className="nav-item"
      aria-current={active}
      onClick={() => go(`#/${route.id}`)}
      title={t(route.blurbKey)}
    >
      <span className="glyph" aria-hidden="true">{route.glyph}</span>
      <span className="nav-label">{t(route.labelKey)}</span>
      {badge ? <span className="nav-badge mono-ltr">{badge}</span> : null}
    </button>
  );
}

function TableStatus({ ready, fraction }: { ready: boolean; fraction: number }): JSX.Element {
  const { t } = useI18n();
  if (ready) return <span className="tag ok">{t('chrome.solverReady')}</span>;
  /*
   * The stage name the solver reports - "distance table: flip x twist" - is
   * a debugging string, not a sentence, and it was being shown to learners in
   * both languages. What they need is that it is working and how far it has
   * got; what it is called is in the console.
   */
  return <FaceletLoader fraction={fraction} label={t('chrome.buildingSolver')} />;
}

/**
 * A one-line note about the optional integration.
 *
 * Present only when it is actually on, because an application that is complete
 * without AI should not spend a line of its chrome advertising that AI exists.
 * The assistant dock carries the state the rest of the time.
 */
function JevStatus(): JSX.Element | null {
  const { t } = useI18n();
  const config = useJevConfig();
  if (!jevActive(config)) return null;
  return <span className="tag ok" title={t('jev.badge.jev.help')}>◇ {t('chrome.jevOn')}</span>;
}

/**
 * Language selector.
 *
 * Switching language only changes which dictionary strings are read from and
 * the document direction. It touches no cube state, no move list, no lesson
 * progress, no Jev configuration and no solver result, so anything in flight
 * survives the switch.
 */
function LanguagePicker({ compact = false }: { compact?: boolean }): JSX.Element {
  const { t, lang, setLang } = useI18n();
  const seg = (
    <div className="seg" role="group" aria-label={t('chrome.language')}>
      {LANGUAGES.map((l) => (
        <button key={l.id} data-lang={l.id} aria-pressed={lang === l.id} lang={l.id} onClick={() => setLang(l.id)}>
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

function ThemePicker({ compact = false }: { compact?: boolean }): JSX.Element {
  const { t } = useI18n();
  const theme = useAppState((s) => s.theme);
  const seg = (
    <div className="seg" role="group" aria-label={t('chrome.theme')}>
      {(['auto', 'light', 'dark'] as const).map((mode) => (
        <button key={mode} data-theme-pick={mode} aria-pressed={theme === mode} onClick={() => actions.setTheme(mode)}>
          {t(`chrome.theme.${mode}`)}
        </button>
      ))}
    </div>
  );
  if (compact) return seg;
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className="card-note">{t('chrome.theme')}</span>
      {seg}
    </div>
  );
}

