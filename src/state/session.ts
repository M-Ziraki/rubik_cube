/**
 * The state of the surrounding interface, as opposed to the state of the cube.
 *
 * Kept apart from the cube store on purpose. The cube store is a record of
 * mathematics - a position and the moves applied to it - and it is read by the
 * solver, the tests and the graders. Whether a panel happens to be open is not
 * that, and mixing the two would mean a panel toggle invalidating a memoised
 * cube or turning up in a progress export.
 *
 * Two things here persist, and only these two: whether the welcome has been
 * seen, and whether the assistant was left open. Both are preferences about
 * the interface, both are harmless, and both would be annoying to restate on
 * every visit. Everything else - the errand a lesson sent you on, the last
 * thing the assistant said - lives for the tab and then goes.
 */

import { useSyncExternalStore } from 'react';

/**
 * Where a learner came from, when they were sent somewhere to try something.
 *
 * This is what makes "open the Atlas, try it, come back" a round trip rather
 * than a one-way door. The lesson records where it was; the Atlas shows a way
 * back; nothing about the lesson's progress is touched in between.
 */
export interface Errand {
  /** Hash to return to. */
  returnTo: string;
  /** i18n key naming the place we came from. */
  fromKey: string;
  /** i18n key naming what is being demonstrated. */
  aboutKey: string;
}

export interface SessionState {
  welcomeSeen: boolean;
  assistantOpen: boolean;
  paletteOpen: boolean;
  errand: Errand | null;
  /** Panels the learner has collapsed, by id. */
  collapsed: Record<string, boolean>;
}

const SEEN_KEY = 'cube-atlas.welcome.v1';
const ASSIST_KEY = 'cube-atlas.assistant.v1';
const COLLAPSE_KEY = 'cube-atlas.collapsed.v1';

function read(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch { return fallback; }
}

function readCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch { return {}; }
}

let state: SessionState = {
  welcomeSeen: read(SEEN_KEY, false),
  assistantOpen: false,
  paletteOpen: false,
  errand: null,
  collapsed: readCollapsed(),
};

const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((l) => l()); };

function set(patch: Partial<SessionState>): void {
  state = { ...state, ...patch };
  emit();
}

export function getSession(): SessionState { return state; }

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSession<T>(selector: (s: SessionState) => T): T {
  return useSyncExternalStore(subscribeSession, () => selector(state), () => selector(state));
}

export const session = {
  dismissWelcome(): void {
    set({ welcomeSeen: true });
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* blocked storage */ }
  },

  /** Bring the welcome back, for someone who wants the starting points again. */
  showWelcome(): void {
    set({ welcomeSeen: false });
    try { localStorage.setItem(SEEN_KEY, '0'); } catch { /* blocked storage */ }
  },

  setAssistantOpen(open: boolean): void {
    set({ assistantOpen: open });
    try { localStorage.setItem(ASSIST_KEY, open ? '1' : '0'); } catch { /* blocked storage */ }
  },

  toggleAssistant(): void { session.setAssistantOpen(!state.assistantOpen); },

  setPaletteOpen(open: boolean): void { set({ paletteOpen: open }); },

  /** Record where to come back to, then go. */
  startErrand(errand: Errand, to: string): void {
    set({ errand });
    window.location.hash = to;
  },

  endErrand(): void { set({ errand: null }); },

  setCollapsed(id: string, collapsed: boolean): void {
    const next = { ...state.collapsed, [id]: collapsed };
    set({ collapsed: next });
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* blocked */ }
  },
};

/** Whether a collapsible section is open, with a per-section default. */
export function useCollapsed(id: string, defaultCollapsed = false): [boolean, (v: boolean) => void] {
  const collapsed = useSession((s) => s.collapsed[id] ?? defaultCollapsed);
  return [collapsed, (v: boolean) => session.setCollapsed(id, v)];
}
