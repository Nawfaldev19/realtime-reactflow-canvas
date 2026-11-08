// A cancellation token for one run of the reveal animation. Everything the run
// starts (its timer, every animation a renderer begins for it) registers a
// cleanup here, so Skip, Replay and unmounting cancel all of it at once, not
// only the top-level timer. A cleanup registered after cancellation runs at once.

export class CancellationToken {
  private cancelled = false;
  private readonly cleanups = new Set<() => void>();

  get isCancelled(): boolean {
    return this.cancelled;
  }

  /** Pending cleanups: the live timers and animations of this run. */
  get pending(): number {
    return this.cleanups.size;
  }

  /** Registers a cleanup; the returned function unregisters it (for work that finished on its own). */
  add(cleanup: () => void): () => void {
    if (this.cancelled) {
      cleanup();
      return () => undefined;
    }
    this.cleanups.add(cleanup);
    return () => {
      this.cleanups.delete(cleanup);
    };
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    const cleanups = [...this.cleanups];
    this.cleanups.clear();
    for (const cleanup of cleanups) cleanup();
  }
}
