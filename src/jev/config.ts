/**
 * Whether Jev is on, and where its key comes from.
 *
 * Three states the application genuinely distinguishes, because they mean
 * different things to a learner:
 *
 *  - the server has a key of its own, and nothing is needed from them;
 *  - they have supplied one for this browser session;
 *  - there is no key, and the deterministic features are all there is.
 *
 * A key a learner types is held in `sessionStorage` and nowhere else. That is
 * a deliberate trade: it disappears when the tab closes and has to be entered
 * again after a refresh, which is annoying, but a credential in `localStorage`
 * outlives the session that needed it and is readable by anything that ever
 * manages to run script on the page. The preference flag persists; the secret
 * does not.
 */

import { useSyncExternalStore } from 'react';

export type KeySource = 'server' | 'session' | 'none';

export interface JevConfig {
  /** The learner's switch. Persisted. */
  enabled: boolean;
  /** True when the server reported a key of its own. */
  serverKey: boolean;
  /** A key entered in this tab. Never persisted, never logged. */
  sessionKey: string | null;
  /** Model the server says it would use. */
  model: string;
  /** Whether the status probe has completed. */
  probed: boolean;
}

const ENABLED_KEY = 'cube-atlas.jev.enabled.v1';
const SESSION_KEY = 'cube-atlas.jev.key.v1';

function readEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
}

function readSessionKey(): string | null {
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}

let state: JevConfig = {
  enabled: readEnabled(),
  serverKey: false,
  sessionKey: readSessionKey(),
  model: 'jev-latest',
  probed: false,
};

const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((l) => l()); };

function set(patch: Partial<JevConfig>): void {
  state = { ...state, ...patch };
  emit();
}

export function getJevConfig(): JevConfig { return state; }

export function subscribeJev(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useJevConfig(): JevConfig {
  return useSyncExternalStore(subscribeJev, getJevConfig, getJevConfig);
}

/** Where the key for the next request would come from, if there is one. */
export function keySource(c: JevConfig = state): KeySource {
  if (c.sessionKey) return 'session';
  if (c.serverKey) return 'server';
  return 'none';
}

/** True when a request would actually be sent. Every call site checks this. */
export function jevActive(c: JevConfig = state): boolean {
  return c.enabled && keySource(c) !== 'none';
}

export const jevConfig = {
  setEnabled(enabled: boolean): void {
    set({ enabled });
    try { localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0'); } catch { /* blocked storage */ }
  },

  /** Store a learner's key for this tab only. */
  setSessionKey(key: string | null): void {
    const trimmed = key?.trim() || null;
    set({ sessionKey: trimmed });
    try {
      if (trimmed) sessionStorage.setItem(SESSION_KEY, trimmed);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* blocked storage */ }
  },

  /** Record what the server said about itself. */
  setServerStatus(serverKey: boolean, model: string): void {
    set({ serverKey, model, probed: true });
  },

  markProbed(): void { set({ probed: true }); },
};
