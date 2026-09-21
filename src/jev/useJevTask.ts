/**
 * Running a Jev task from a component, safely.
 *
 * The hazard this exists to remove is a late answer. A learner starts an
 * exercise, the assessment is slow, they give up and start another one - and
 * the first answer arrives and grades the second. Every run therefore carries
 * a token; the result is applied only if the token is still current, and the
 * previous request is aborted before a new one starts.
 *
 * The hook never throws at a component. A failure is a state, because a
 * failure is never fatal here: there is always a deterministic answer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { JevError, askJev } from './client';
import { jevActive, useJevConfig } from './config';
import { TaskRunner } from './runner';
import type { JevDecision, JevErrorCode, JevRequest } from './protocol';

export type JevPhase = 'idle' | 'thinking' | 'done' | 'failed';

export interface JevTaskState<D extends JevDecision> {
  phase: JevPhase;
  decision: D | null;
  error: JevErrorCode | null;
  retryAfter?: number;
}

export interface JevTaskApi<D extends JevDecision> extends JevTaskState<D> {
  /** Start a run. Cancels any run already in flight. */
  run: (request: JevRequest) => Promise<D | null>;
  /** Abandon whatever is running and go back to idle. */
  cancel: () => void;
  /** True when a run would actually reach the network. */
  available: boolean;
}

export function useJevTask<D extends JevDecision>(): JevTaskApi<D> {
  const config = useJevConfig();
  const [state, setState] = useState<JevTaskState<D>>({
    phase: 'idle', decision: null, error: null,
  });

  const runner = useMemo(() => new TaskRunner<D>(), []);

  // A component that goes away must not leave a request running.
  useEffect(() => () => runner.cancel(), [runner]);

  const cancel = useCallback(() => {
    runner.cancel();
    setState({ phase: 'idle', decision: null, error: null });
  }, [runner]);

  const run = useCallback(async (request: JevRequest): Promise<D | null> => {
    if (!jevActive()) {
      runner.cancel();
      setState({ phase: 'failed', decision: null, error: 'disabled' });
      return null;
    }

    setState({ phase: 'thinking', decision: null, error: null });
    // `run` resolves with null when this call has been superseded, which is
    // exactly when its result must not touch the component's state.
    const decision = await runner.run(async (signal) => {
      try {
        return await askJev(request, signal) as D;
      } catch (err) {
        const code = err instanceof JevError ? err.code : 'server';
        if (code === 'aborted') return null as never;
        throw err;
      }
    }).catch((err: unknown) => {
      const code = err instanceof JevError ? err.code : 'server';
      setState({
        phase: 'failed',
        decision: null,
        error: code,
        retryAfter: err instanceof JevError ? err.retryAfter : undefined,
      });
      return null;
    });

    if (decision === null) return null;
    setState({ phase: 'done', decision, error: null });
    return decision;
  }, [runner]);

  return { ...state, run, cancel, available: jevActive(config) };
}
