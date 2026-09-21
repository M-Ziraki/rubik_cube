/**
 * Token-and-abort discipline for one slot of in-flight work.
 *
 * Pulled out of the React hook so it can be tested directly, because what it
 * prevents is the kind of bug that only shows up under timing you cannot
 * reproduce by hand: a learner abandons an exercise, the assessment for it
 * arrives late, and grades the exercise they moved on to.
 *
 * Two mechanisms, deliberately both. Aborting stops the work; the token stops
 * a result that was already on its way back from being applied. Either alone
 * leaves a window.
 */

export class TaskRunner<T> {
  #token = 0;
  #abort: AbortController | null = null;

  /**
   * Run `work`, cancelling anything already running.
   *
   * Resolves with the result, or with `null` if this run was superseded or
   * cancelled before it finished. A `null` means "do not act on this", which
   * callers must honour - that is the whole point.
   */
  async run(work: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    this.#abort?.abort();
    const mine = ++this.#token;
    const controller = new AbortController();
    this.#abort = controller;

    try {
      const result = await work(controller.signal);
      return mine === this.#token ? result : null;
    } finally {
      if (mine === this.#token) this.#abort = null;
    }
  }

  /** True when this token is still the current one. */
  isCurrent(token: number): boolean { return token === this.#token; }

  /** The token a caller can check later, for work it runs itself. */
  get token(): number { return this.#token; }

  /** Abandon whatever is running. Any result already in flight is discarded. */
  cancel(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#token += 1;
  }
}
