import type { DiagramDocument } from "../document/types";

// Autosave scheduling, independent of React and of the network layer.
//
// - Debounce: save 2 s after the last change, but at least every 10 s while
//   changes keep coming (max-wait).
// - Revision check: every save carries the revision it was built on. On a
//   conflict the target rebases its unsaved operations onto the server copy
//   and the save is retried at once; after repeated conflicts it stops and
//   asks the person.
// - Network failures retry with backoff 0.5 s × 2^(n−1); after five failed
//   attempts it stops and offers "Retry now".
// - Each attempt takes a fresh snapshot, so a retry always sends the latest state.

export type SaveStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved"; readonly at: number }
  | { readonly kind: "retrying"; readonly attempt: number }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "conflict" }
  // Set while collaborating (collab/client.ts), where the server stores every change.
  | { readonly kind: "syncing" }
  | { readonly kind: "offline" };

export interface SaveSnapshot {
  readonly baseRevision: number;
  readonly document: DiagramDocument;
  /** The last local change included in this snapshot. */
  readonly changeId: number;
}

export interface ConflictOutcome {
  readonly kind: "conflict";
  readonly revision: number;
  readonly document: unknown;
  readonly updatedBy: string | null;
}

export type SaveOutcome =
  | { readonly kind: "saved"; readonly revision: number }
  | ConflictOutcome
  | { readonly kind: "rejected"; readonly message: string };

export interface AutosaveTarget {
  snapshot(): SaveSnapshot;
  hasUnsavedChanges(): boolean;
  markSaved(revision: number, changeId: number): void;
  /** Replace the base with the server copy and replay unsaved local changes on top. */
  rebase(conflict: ConflictOutcome): void;
}

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export interface AutosaveOptions {
  readonly target: AutosaveTarget;
  readonly save: (snapshot: SaveSnapshot, options: { keepalive: boolean }) => Promise<SaveOutcome>;
  readonly onStatus: (status: SaveStatus) => void;
  readonly debounceMs?: number;
  readonly maxWaitMs?: number;
  readonly retryBaseMs?: number;
  readonly maxAttempts?: number;
  readonly maxConflictRetries?: number;
  readonly clock?: Clock;
}

const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle);
  },
};

export const OFFLINE_MESSAGE = "We couldn't reach the server, so your latest changes are not saved yet.";

type Handle = ReturnType<typeof setTimeout>;

export class AutosaveController {
  private readonly options: Required<AutosaveOptions>;
  private status: SaveStatus = { kind: "idle" };
  private debounceTimer: Handle | null = null;
  private maxWaitTimer: Handle | null = null;
  private retryTimer: Handle | null = null;
  private inFlight: Promise<void> | null = null;
  private runAgain = false;
  private failures = 0;
  private conflicts = 0;
  private disposed = false;

  constructor(options: AutosaveOptions) {
    this.options = {
      debounceMs: 2000,
      maxWaitMs: 10_000,
      retryBaseMs: 500,
      maxAttempts: 5,
      maxConflictRetries: 3,
      clock: systemClock,
      ...options,
    };
  }

  get currentStatus(): SaveStatus {
    return this.status;
  }

  /** Call after every local change. */
  changed(): void {
    if (this.disposed || this.status.kind === "conflict") return;
    if (!this.inFlight) this.setStatus({ kind: "pending" });
    this.schedule();
  }

  private schedule() {
    const { clock, debounceMs, maxWaitMs } = this.options;
    if (this.debounceTimer !== null) clock.clearTimeout(this.debounceTimer);
    this.debounceTimer = clock.setTimeout(() => void this.run(false), debounceMs);
    this.maxWaitTimer ??= clock.setTimeout(() => void this.run(false), maxWaitMs);
  }

  /** Save now (for example when the page is hidden). `keepalive` lets the request outlive the page. */
  flush({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> {
    if (this.status.kind === "conflict") return Promise.resolve();
    return this.run(keepalive);
  }

  /** "Retry now" after the save gave up, or after the person resolved a conflict. */
  retryNow(): Promise<void> {
    this.failures = 0;
    this.conflicts = 0;
    this.setStatus({ kind: "pending" });
    return this.run(false);
  }

  /** The person loaded the latest copy and discarded their changes. */
  reset(): void {
    this.clearTimers();
    this.failures = 0;
    this.conflicts = 0;
    this.setStatus({ kind: "idle" });
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  private setStatus(status: SaveStatus) {
    this.status = status;
    if (!this.disposed) this.options.onStatus(status);
  }

  private clearTimers() {
    const { clock } = this.options;
    for (const timer of [this.debounceTimer, this.maxWaitTimer, this.retryTimer])
      if (timer !== null) clock.clearTimeout(timer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    this.retryTimer = null;
  }

  private run(keepalive: boolean): Promise<void> {
    if (this.disposed && !keepalive) return Promise.resolve();
    if (this.inFlight) {
      this.runAgain = true;
      return this.inFlight;
    }
    this.clearTimers();
    if (!this.options.target.hasUnsavedChanges()) return Promise.resolve();

    this.inFlight = this.attempt(keepalive).finally(() => {
      this.inFlight = null;
      if (this.runAgain) {
        this.runAgain = false;
        void this.run(false);
      }
    });
    return this.inFlight;
  }

  private async attempt(keepalive: boolean): Promise<void> {
    const { target, save, clock } = this.options;
    this.setStatus({ kind: "saving" });
    const snapshot = target.snapshot();
    let outcome: SaveOutcome;
    try {
      outcome = await save(snapshot, { keepalive });
    } catch {
      this.networkFailure();
      return;
    }
    this.failures = 0;

    switch (outcome.kind) {
      case "saved":
        this.conflicts = 0;
        target.markSaved(outcome.revision, snapshot.changeId);
        if (target.hasUnsavedChanges()) {
          this.setStatus({ kind: "pending" });
          this.schedule();
        } else {
          this.setStatus({ kind: "saved", at: clock.now() });
        }
        return;
      case "conflict":
        this.conflicts += 1;
        target.rebase(outcome);
        if (this.conflicts > this.options.maxConflictRetries) this.setStatus({ kind: "conflict" });
        else this.runAgain = true;
        return;
      case "rejected":
        this.setStatus({ kind: "failed", message: outcome.message });
        return;
    }
  }

  private networkFailure() {
    this.failures += 1;
    const { maxAttempts, retryBaseMs, clock } = this.options;
    if (this.failures >= maxAttempts) {
      this.setStatus({ kind: "failed", message: OFFLINE_MESSAGE });
      return;
    }
    this.setStatus({ kind: "retrying", attempt: this.failures });
    this.retryTimer = clock.setTimeout(() => void this.run(false), retryBaseMs * 2 ** (this.failures - 1));
  }
}
