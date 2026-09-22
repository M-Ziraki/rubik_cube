/**
 * The four sections, and what each one composes.
 *
 * Nine destinations became four because several of them were the same thing
 * under different names - the Atlas and the Cube lab were both "a cube you
 * can turn, scramble and solve"; the Solvers page imported a component from
 * the Cube lab - and two of them were not activities at all. Nothing was
 * deleted. Every page is still here, as a tab inside the section it belongs
 * to, and every old address still resolves.
 *
 * A section owns its header and its tabs; the pages inside own their own
 * content and, where they have several views of one thing, a value picker
 * rather than a second tablist.
 */

import { Tabs, TabPanel } from '../components/Tabs';
import { PageHeader } from '../components/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import { routeById, useTab } from '../state/navigation';
import type { Translate } from '../i18n/I18nProvider';

/** A section's tabs, labelled, from the one place that defines them. */
function tabsOf(route: string, t: Translate): { id: string; label: string }[] {
  return (routeById(route).tabs ?? []).map((tab) => ({ id: tab.id, label: t(tab.labelKey) }));
}
import { CoursePage, openLesson } from './CoursePage';
import { AtlasPage } from './AtlasPage';
import { LabPage } from './LabPage';
import { GraphPage } from './GraphPage';
import { SolverPage } from './SolverPage';
import { ScanPage } from './ScanPage';
import { ChallengeRunner, ProgressView, PathView } from './TrainingPage';
import { LearningLabPage } from './LearningLabPage';
import { SettingsPage } from './SettingsPage';

/**
 * Learn: the course, and the record of it.
 *
 * Progress lived inside a tab on Training, which meant "what have I learned"
 * was hidden one level down inside "give me something to do". They are
 * different questions and the second is not where anybody looks for the first.
 */
export function LearnSection(): JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useTab('learn');

  // A lesson takes over the whole section: it has its own header, its own
  // progress bar and its own way back, and a tab strip above it would be
  // navigation for a page the learner has already left.
  if (openLesson()) return <CoursePage />;

  return (
    <>
      <PageHeader eyebrow={t('nav.section.learn')} title={t('nav.learn')} lede={t('nav.learn.lede')}>
        <Tabs
          value={tab}
          onChange={setTab}
          label={t('learn.tabs')}
          tabs={tabsOf('learn', t)}
        />
      </PageHeader>
      <TabPanel>{tab === 'progress' ? <ProgressView /> : <CoursePage />}</TabPanel>
    </>
  );
}

/**
 * Cube: one workspace, two toolsets.
 *
 * The Atlas and the Cube lab were two addresses for the same cube. They are
 * now two views of it - the picture, and the algebra - over one shared state,
 * so a sequence typed in one is on the cube in the other.
 */
export function CubeSection(): JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useTab('cube');
  return (
    <>
      {tab === 'sequences' ? (
        <>
          <PageHeader eyebrow={t('nav.section.do')} title={t('nav.cube')} lede={t('lab.lede')}>
            <CubeTabs tab={tab} setTab={setTab} />
          </PageHeader>
          <TabPanel><LabPage /></TabPanel>
        </>
      ) : (
        // The workspace keeps its compact bar: it is the one page where the
        // controls have to be on screen with the thing they control.
        <AtlasPage tabs={<CubeTabs tab={tab} setTab={setTab} />} />
      )}
    </>
  );
}

function CubeTabs({ tab, setTab }: { tab: string; setTab: (t: string) => void }): JSX.Element {
  const { t } = useI18n();
  return (
    <Tabs
      value={tab}
      onChange={setTab}
      label={t('cube.tabs')}
      tabs={tabsOf('cube', t)}
    />
  );
}

/** Practise: everything that means "do something with a real position". */
export function PractiseSection(): JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useTab('practise');
  return (
    <>
      <PageHeader
        eyebrow={t('nav.section.do')}
        title={t('nav.practise')}
        lede={t('nav.practise.lede')}
      >
        <Tabs
          value={tab}
          onChange={setTab}
          label={t('practise.tabs')}
          tabs={tabsOf('practise', t)}
        />
      </PageHeader>
      <TabPanel>
        {tab === 'your-cube' ? <ScanPage /> : tab === 'path' ? <PathView /> : <ChallengeRunner />}
      </TabPanel>
    </>
  );
}

/**
 * Explore: the mathematics.
 *
 * Both halves were already advanced material sitting at the same level as
 * "type in your cube". Together they are one place a learner arrives at when
 * they are ready, and one place the palette can always reach by name.
 */
export function ExploreSection(): JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useTab('explore');
  return (
    <>
      <PageHeader
        eyebrow={t('nav.section.do')}
        title={t('nav.explore')}
        lede={t('nav.explore.lede')}
      >
        <Tabs
          value={tab}
          onChange={setTab}
          label={t('explore.tabs')}
          tabs={tabsOf('explore', t)}
        />
      </PageHeader>
      <TabPanel>{tab === 'solvers' ? <SolverPage /> : <GraphPage />}</TabPanel>
    </>
  );
}

/**
 * Setup: the switches, and the evidence behind the one that matters.
 *
 * The AI Learning Lab was a top-level destination showing evaluation
 * datasets, thresholds and probability distributions. That is documentation
 * about the integration, and it belongs beside the switch that turns the
 * integration on rather than competing with the cube for a place in the
 * navigation.
 */
export function SettingsSection(): JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useTab('settings');
  return (
    <>
      <PageHeader
        eyebrow={t('nav.section.system')}
        title={t('nav.settings')}
        lede={t('settings.lede')}
      >
        <Tabs
          value={tab}
          onChange={setTab}
          label={t('settings.tabs')}
          tabs={tabsOf('settings', t)}
        />
      </PageHeader>
      <TabPanel>{tab === 'jev' ? <LearningLabPage /> : <SettingsPage />}</TabPanel>
    </>
  );
}
