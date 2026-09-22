/**
 * What the assistant knows about the page it is sitting on.
 *
 * The alternative was to teach the assistant panel about every page - a switch
 * over route ids, reaching into each page's internals. That would have put the
 * training page's hint logic and the Atlas's move queue inside a chat panel,
 * which is exactly the kind of drift that turns a companion into a second,
 * worse copy of the application.
 *
 * So the flow is inverted: a page publishes what it can offer while it is
 * mounted, and the assistant renders whatever is there. A page that publishes
 * nothing still gets the universal help, because the universal help needs
 * nothing from the page.
 */

import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import type { CommandAction } from './protocol';

export interface AssistantAction {
  id: string;
  /** i18n key for the button. */
  labelKey: string;
  /** i18n key for the line under it. */
  noteKey: string;
  /**
   * What happens when it is pressed. A page action reaches into the page - it
   * focuses a widget, opens a ladder, starts an exercise - so the work and the
   * mathematics stay where they already are.
   */
  run: () => void;
  /** True when pressing it should close the panel, because the page takes over. */
  closes?: boolean;
  /** True when the action leads to something Jev judges; used for the label. */
  usesJev?: boolean;
}

export interface AssistantContext {
  /** i18n key naming the page, for "you are here". */
  labelKey: string;
  /** Page-contributed shortcuts. */
  actions: AssistantAction[];
  /**
   * Present when this page can carry out a spoken instruction. The assistant
   * shows its input only where there is something to act on - a command box on
   * a page with no cube would be a box that cannot work.
   */
  commandSink?: (action: CommandAction) => void;
}

const EMPTY: AssistantContext = { labelKey: 'nav.atlas', actions: [] };

let current: AssistantContext = EMPTY;
const listeners = new Set<() => void>();

function emit(): void { listeners.forEach((l) => l()); }

export function getAssistantContext(): AssistantContext { return current; }

export function useAssistantContextValue(): AssistantContext {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    getAssistantContext,
    getAssistantContext,
  );
}

/**
 * Publish this page's offer for as long as it is mounted.
 *
 * `deps` is the caller's responsibility because the handlers close over page
 * state: a stale `run` would act on a position the learner has left. Pages
 * pass the values their handlers actually read.
 */
export function usePublishAssistantContext(
  build: () => AssistantContext,
  deps: unknown[],
): void {
  useEffect(() => {
    const mine = build();
    current = mine;
    emit();
    return () => {
      // React mounts the next page before unmounting the last one, so a naive
      // cleanup would blank the offer the new page has just published. Clear
      // only what is still ours.
      if (current !== mine) return;
      current = EMPTY;
      emit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
