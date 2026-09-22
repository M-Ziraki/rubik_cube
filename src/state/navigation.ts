/**
 * Where you can be, in one place.
 *
 * This used to list nine destinations, which is where most of the confusion
 * lived. Several of them overlapped - the Atlas and the Cube lab were both
 * "a cube you can turn, scramble and solve", the Solvers page imported a
 * component from the Cube lab - and two of them (the AI lab, and Progress,
 * which was hidden inside a tab) were not activities at all.
 *
 * There are now four sections and a setup page. Nothing was removed: every
 * page that existed still exists, as a tab inside the section it belongs to.
 * The nine old addresses still work and land in the right tab, because people
 * bookmark things and because a restructure that breaks links is a
 * restructure that gets reverted.
 */

import { useEffect, useState } from 'react';

export type SectionId = 'learn' | 'do' | 'system';

export interface RouteDef {
  id: string;
  /** i18n key for the label. */
  labelKey: string;
  /** i18n key for a one-line description, used in the palette and the welcome. */
  blurbKey: string;
  glyph: string;
  section: SectionId;
  /**
   * A workspace page puts a tool on screen and needs its controls in reach, so
   * it gets the compact bar. A reading page is prose and gets a generous one.
   */
  kind: 'workspace' | 'reading';
  /** Shown in the mobile tab bar rather than behind "More". */
  primary?: boolean;
  /**
   * The tabs this section owns, in order; the first is its default.
   *
   * They carry their labels because they are destinations, not decoration:
   * the palette indexes them, so "state space" still reaches the state space
   * by name even though it is no longer a page of its own. A restructure that
   * makes something harder to find has not simplified anything.
   */
  tabs?: readonly { id: string; labelKey: string; aliasKey?: string }[];
  /**
   * The names this destination used to have.
   *
   * A rename should not make something unfindable by the name somebody
   * learned it under. "Cube lab" and "The Atlas" are not on screen any more;
   * typing either of them still gets you there.
   */
  aliasKey?: string;
}

export const ROUTES: RouteDef[] = [
  {
    id: 'learn', labelKey: 'nav.learn', blurbKey: 'nav.learn.blurb', glyph: '▤',
    aliasKey: 'nav.alias.learn',
    section: 'learn', kind: 'reading', primary: true,
    tabs: [
      { id: 'lessons', labelKey: 'learn.tab.lessons' },
      { id: 'progress', labelKey: 'learn.tab.progress', aliasKey: 'nav.alias.progress' },
    ],
  },
  {
    id: 'cube', labelKey: 'nav.cube', blurbKey: 'nav.cube.blurb', glyph: '◎',
    aliasKey: 'nav.alias.cube',
    section: 'do', kind: 'workspace', primary: true,
    tabs: [
      { id: 'workspace', labelKey: 'cube.tab.workspace' },
      { id: 'sequences', labelKey: 'cube.tab.sequences', aliasKey: 'nav.alias.sequences' },
    ],
  },
  {
    id: 'practise', labelKey: 'nav.practise', blurbKey: 'nav.practise.blurb', glyph: '◈',
    aliasKey: 'nav.alias.practise',
    section: 'do', kind: 'workspace', primary: true,
    tabs: [
      { id: 'challenges', labelKey: 'practise.tab.challenges' },
      { id: 'your-cube', labelKey: 'practise.tab.yourCube' },
      { id: 'path', labelKey: 'practise.tab.path' },
    ],
  },
  {
    id: 'explore', labelKey: 'nav.explore', blurbKey: 'nav.explore.blurb', glyph: '✳',
    section: 'do', kind: 'workspace', primary: true,
    tabs: [
      { id: 'state-space', labelKey: 'explore.tab.stateSpace' },
      { id: 'solvers', labelKey: 'explore.tab.solvers' },
    ],
  },
  {
    id: 'settings', labelKey: 'nav.settings', blurbKey: 'nav.settings.blurb', glyph: '⚙',
    section: 'system', kind: 'reading', primary: true,
    tabs: [
      { id: 'general', labelKey: 'settings.tab.general' },
      { id: 'jev', labelKey: 'settings.tab.jev', aliasKey: 'nav.alias.jev' },
    ],
  },
];

export const SECTIONS: SectionId[] = ['learn', 'do', 'system'];

/**
 * The nine old addresses, and where each one now lives.
 *
 * Kept indefinitely rather than for a release: they cost one lookup, they are
 * what every existing link and every browser history entry points at, and
 * three of them read better than their replacements in a sentence.
 */
export const LEGACY_ROUTES: Record<string, string> = {
  atlas: '#/cube',
  lab: '#/cube/sequences',
  course: '#/learn',
  training: '#/practise',
  scan: '#/practise/your-cube',
  graph: '#/explore/state-space',
  solver: '#/explore/solvers',
  'ai-lab': '#/settings/jev',
};

export function routeById(id: string): RouteDef {
  return ROUTES.find((r) => r.id === id) ?? ROUTES[0];
}

/** The route id in the hash, ignoring anything after it. */
export function readRoute(hash = window.location.hash): string {
  const raw = hash.replace(/^#\/?/, '').split('/')[0];
  return ROUTES.some((r) => r.id === raw) ? raw : 'cube';
}

/** The segment after the route id: a tab name, or a lesson id. */
export function readSubRoute(hash = window.location.hash): string | null {
  return hash.split('/')[2] ?? null;
}

/**
 * The tab a hash selects, falling back to the section's first.
 *
 * A sub-route that is not a tab name is not an error: on `learn` it is a
 * lesson id, and the page decides what to do with it.
 */
export function readTab(route: string, hash = window.location.hash): string {
  const def = routeById(route);
  const sub = readSubRoute(hash);
  if (sub && def.tabs?.some((x) => x.id === sub)) return sub;
  return def.tabs?.[0]?.id ?? '';
}

export function go(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#/${path}`;
}

/**
 * Send an old address to its new home, before anything renders.
 *
 * Returns true when it redirected, so the caller can skip a paint that would
 * only be thrown away.
 */
export function redirectLegacy(hash = window.location.hash): boolean {
  const raw = hash.replace(/^#\/?/, '').split('/');
  const target = LEGACY_ROUTES[raw[0]];
  if (!target) return false;
  // `#/course/notation` has to keep its lesson.
  const rest = raw.slice(1).join('/');
  const keepsRest = raw[0] === 'course' && rest;
  window.location.replace(`${window.location.pathname}${window.location.search}`
    + (keepsRest ? `#/learn/${rest}` : target));
  return true;
}

/** Subscribe to the hash. Returns the current route id. */
export function useRoute(): string {
  const [route, setRoute] = useState(() => readRoute());
  useEffect(() => {
    const onHash = (): void => { if (!redirectLegacy()) setRoute(readRoute()); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

/** The full hash, for anything that cares about the sub-route too. */
export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = (): void => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash;
}

/** The tab currently selected in a section, kept in the address. */
export function useTab(route: string): [string, (tab: string) => void] {
  const hash = useHash();
  const tab = readTab(route, hash);
  return [tab, (next: string) => go(`#/${route}/${next}`)];
}
