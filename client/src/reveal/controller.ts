import { CancellationToken } from "./cancellation";
import { phaseChanges, type ConnectorPhase, type NodePhase, type PhaseChange, type Timeline } from "./timeline";

// Runs a reveal timeline. One controller per preview surface holds every
// handle of the current run in a cancellation token: its single timer (only
// the next phase change is ever scheduled) and every animation the renderers
// start for it. Play, Replay, Skip and stop cancel the whole run. Stopping is
// not final (React's development double mount stops and restarts effects), so
// a stopped controller can play again.
//
// The controller only publishes phases ("revealed" state per element); the
// renderers read them and run their own fade and draw animations, which they
// register with `track` so cancellation reaches them too. An element the
// timeline does not know (for example a step added by a refetch during a run)
// is shown.

export interface RevealClock {
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export const browserClock: RevealClock = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    window.clearTimeout(handle as number);
  },
};

export type RevealStatus = "idle" | "running" | "done";

/** What a renderer hands over: anything that can be cancelled (a Web Animations API `Animation`). */
export interface Cancellable {
  cancel: () => void;
}

export class RevealController {
  private token = new CancellationToken();
  private status: RevealStatus = "idle";
  private nodes = new Map<string, NodePhase>();
  private connectors = new Map<string, ConnectorPhase>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly clock: RevealClock = browserClock) {}

  get currentStatus(): RevealStatus {
    return this.status;
  }

  /** Live timers and animations of the current run. */
  get pending(): number {
    return this.token.pending;
  }

  nodePhase = (id: string): NodePhase => this.nodes.get(id) ?? "shown";
  connectorPhase = (id: string): ConnectorPhase => this.connectors.get(id) ?? "shown";

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Starts (or restarts) from an empty canvas. */
  play(timeline: Timeline): void {
    this.token.cancel();
    const token = new CancellationToken();
    this.token = token;
    this.nodes = new Map();
    this.connectors = new Map();
    for (const cue of timeline.cues) {
      if (cue.kind === "node") this.nodes.set(cue.id, "hidden");
      else for (const id of cue.ids) this.connectors.set(id, "hidden");
    }
    this.status = "running";
    this.advance(token, phaseChanges(timeline), 0, this.clock.now());
  }

  /** Shows the final state at once and cancels everything of the current run; nothing to do unless a run is going. */
  skip(): void {
    if (this.status !== "running") return;
    this.finish();
    this.publish();
  }

  /** Cancels everything without publishing (the surface is going away). */
  stop(): void {
    this.finish();
  }

  /** Ties a renderer's animation to the current run; cancelled at once when no run is active. Returns an unregister function. */
  track(animation: Cancellable): () => void {
    if (this.status !== "running") {
      animation.cancel();
      return () => undefined;
    }
    return this.token.add(() => {
      animation.cancel();
    });
  }

  private advance(token: CancellationToken, changes: readonly PhaseChange[], from: number, startedAt: number): void {
    const elapsed = this.clock.now() - startedAt;
    let index = from;
    for (let change = changes[index]; change !== undefined && change.at <= elapsed; change = changes[index]) {
      if (change.target === "node") this.nodes.set(change.id, change.phase as NodePhase);
      else this.connectors.set(change.id, change.phase as ConnectorPhase);
      index += 1;
    }
    const next = changes[index];
    if (next === undefined) {
      this.status = "done";
      this.nodes = new Map();
      this.connectors = new Map();
    } else {
      const handle = this.clock.setTimeout(() => {
        unregister();
        this.advance(token, changes, index, startedAt);
      }, next.at - elapsed);
      const unregister = token.add(() => {
        this.clock.clearTimeout(handle);
      });
    }
    this.publish();
  }

  private finish(): void {
    this.token.cancel();
    this.nodes = new Map();
    this.connectors = new Map();
    // A controller that never played stays idle (nothing was revealed).
    if (this.status === "running") this.status = "done";
  }

  private publish(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
