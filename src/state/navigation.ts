/**
 * Where you can be, in one place.
 *
 * The route table used to live inside `App.tsx`, which meant nothing else
 * could see it: the command palette had to restate every destination, the
 * assistant had to guess which page it was on, and a renamed section was three
 * edits. Everything that needs to know about pages reads this module instead.
 *
 * Routes keep their old ids, because ids are in URLs people may have kept and
 * in the browser harnesses. What changed is how they are grouped and labelled.
 */

import { useEffect, useState } from 'react';

export type SectionId = 'learn' | 'explore' | 'practice' | 'system';

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
}

export const ROUTES: RouteDef[] = [
  {
    id: 'atlas', labelKey: 'nav.atlas', blurbKey: 'nav.atlas.blurb', glyph: '◎',
    section: 'explore', kind: 'workspace', primary: true,
  },
  {
    id: 'course', labelKey: 'nav.course', blurbKey: 'nav.course.blurb', glyph: '▤',
    section: 'learn', kind: 'reading', primary: true,
  },
  {
    id: 'training', labelKey: 'nav.training', blurbKey: 'nav.training.blurb', glyph: '◈',
    section: 'practice', kind: 'workspace', primary: true,
  },
  {
    id: 'scan', labelKey: 'nav.scan', blurbKey: 'nav.scan.blurb', glyph: '◧',
    section: 'practice', kind: 'workspace', primary: true,
  },
  {
    id: 'lab', labelKey: 'nav.lab', blurbKey: 'nav.lab.blurb', glyph: '▣',
    section: 'explore', kind: 'workspace',
  },
  {
    id: 'graph', labelKey: 'nav.graph', blurbKey: 'nav.graph.blurb', glyph: '✳',
    section: 'explore', kind: 'workspace',
  },
  {
    id: 'solver', labelKey: 'nav.solver', blurbKey: 'nav.solver.blurb', glyph: '⟲',
    section: 'practice', kind: 'workspace',
  },
  {
    id: 'ai-lab', labelKey: 'nav.aiLab', blurbKey: 'nav.aiLab.blurb', glyph: '◇',
    section: 'system', kind: 'reading',
  },
  {
    id: 'settings', labelKey: 'nav.settings', blurbKey: 'nav.settings.blurb', glyph: '⚙',
    section: 'system', kind: 'reading',
  },
];

export const SECTIONS: SectionId[] = ['learn', 'explore', 'practice', 'system'];

export function routeById(id: string): RouteDef {
  return ROUTES.find((r) => r.id === id) ?? ROUTES[0];
}

/** The route id in the hash, ignoring anything after it. */
export function readRoute(hash = window.location.hash): string {
  const raw = hash.replace(/^#\/?/, '').split('/')[0];
  return ROUTES.some((r) => r.id === raw) ? raw : 'atlas';
}

/** The segment after the route id, which lessons use for their own id. */
export function readSubRoute(hash = window.location.hash): string | null {
  return hash.split('/')[2] ?? null;
}

export function go(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#/${path}`;
}

/** Subscribe to the hash. Returns the current route id. */
export function useRoute(): string {
  const [route, setRoute] = useState(() => readRoute());
  useEffect(() => {
    const onHash = (): void => setRoute(readRoute());
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
