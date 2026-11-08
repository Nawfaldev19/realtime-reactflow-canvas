// The connection and resynchronization state machine of one collaborative
// editing session. Pure: `transition(state, event)` returns the next state and
// the effects to run (open or close the socket, send a join, re-send pending
// operations, set or clear the one timer). The collaboration client
// (client.ts) runs the effects and feeds back events, so every path, including
// timeouts and retries, is tested without a socket or a clock.
//
//   idle ─start─▶ connecting ─connected─▶ joining ─synced─▶ live
//                    │  ▲                   │  ▲  synced       │ gap (after a wait) / overflow / resume
//          timeout / │  │ retry timer       │  │  (off)        ▼
//      disconnected  ▼  │                   │  └─ standby    joining …
//                  offline ◀────────────────┴─────────────────┘  timeout / disconnected
//
// Every connection starts with a join, whose reply also says whether
// collaboration is on. While it is off the socket stays open in `standby`
// (the room announces when it is switched back on) and edits are autosaved
// instead. A rejected subscription (no access) is final.

export type JoinReason = "connect" | "gap" | "resume" | "enable";

export type SyncState =
  | { readonly kind: "idle" }
  | { readonly kind: "connecting"; readonly attempt: number; readonly enabled: boolean }
  | { readonly kind: "standby" }
  /** `enabled`: collaboration is known to be on (edits already go to the room). */
  | { readonly kind: "joining"; readonly attempt: number; readonly reason: JoinReason; readonly enabled: boolean }
  | { readonly kind: "live"; readonly gap: boolean }
  | { readonly kind: "offline"; readonly attempt: number; readonly enabled: boolean }
  | { readonly kind: "rejected" }
  | { readonly kind: "stopped" };

export type SyncEvent =
  | { readonly type: "start"; readonly enabled: boolean }
  | { readonly type: "connected" }
  | { readonly type: "disconnected" }
  | { readonly type: "timeout" }
  | { readonly type: "synced"; readonly enabled: boolean }
  | { readonly type: "gapOpened" }
  | { readonly type: "gapClosed" }
  | { readonly type: "overflow" }
  /** The tab came back after a long time hidden, or the browser came back online. */
  | { readonly type: "resume" }
  | { readonly type: "enable" }
  | { readonly type: "disable" }
  | { readonly type: "rejected" }
  | { readonly type: "stop" };

export type SyncEffect =
  | { readonly type: "open" }
  | { readonly type: "close" }
  /** `fromScratch`: ask for a snapshot (the local copy has no trusted sequence number). */
  | { readonly type: "join"; readonly fromScratch: boolean }
  | { readonly type: "resendPending" }
  | { readonly type: "setTimer"; readonly ms: number }
  | { readonly type: "clearTimer" };

export interface Timing {
  /** How long a socket may take to open and confirm the subscription. */
  readonly connectTimeoutMs: number;
  /** How long to wait for the reply to a join. */
  readonly joinTimeoutMs: number;
  /** How long to wait for missing sequence numbers before resynchronizing. */
  readonly gapWaitMs: number;
  /** Returns a number in [0, 1); tests pass in their own. */
  readonly random: () => number;
}

export const DEFAULT_TIMING: Timing = {
  connectTimeoutMs: 8000,
  joinTimeoutMs: 8000,
  gapWaitMs: 1000,
  random: Math.random,
};

export const MAX_BACKOFF_MS = 30_000;
export const BASE_BACKOFF_MS = 500;
export const JITTER = 0.2;

/** Reconnect delay after `attempt` failures in a row: min(30 s, 0.5 s × 2^attempt) with ±20% jitter. */
export function backoffDelay(attempt: number, random: () => number): number {
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.round(base * (1 + (random() * 2 - 1) * JITTER));
}

export interface Transition {
  readonly state: SyncState;
  readonly effects: readonly SyncEffect[];
}

export const IDLE: SyncState = { kind: "idle" };

const stay = (state: SyncState): Transition => ({ state, effects: [] });

/** The same transition, first clearing whatever timer was running. */
const clearing = (next: Transition): Transition => ({
  state: next.state,
  effects: [{ type: "clearTimer" }, ...next.effects],
});

function joining(attempt: number, reason: JoinReason, enabled: boolean, timing: Timing): Transition {
  return {
    state: { kind: "joining", attempt, reason, enabled },
    effects: [
      { type: "join", fromScratch: reason === "enable" },
      { type: "setTimer", ms: timing.joinTimeoutMs },
    ],
  };
}

function goOffline(attempt: number, enabled: boolean, timing: Timing): Transition {
  return {
    state: { kind: "offline", attempt: attempt + 1, enabled },
    effects: [{ type: "close" }, { type: "setTimer", ms: backoffDelay(attempt, timing.random) }],
  };
}

function connecting(attempt: number, enabled: boolean, timing: Timing): Transition {
  return {
    state: { kind: "connecting", attempt, enabled },
    effects: [{ type: "open" }, { type: "setTimer", ms: timing.connectTimeoutMs }],
  };
}

const standby: Transition = { state: { kind: "standby" }, effects: [{ type: "clearTimer" }] };

/** Whether edits go through the room (true) or through autosave (false) in this state. */
export function isCollaborating(state: SyncState): boolean {
  switch (state.kind) {
    case "connecting":
    case "offline":
    case "joining":
      return state.enabled;
    case "live":
      return true;
    default:
      return false;
  }
}

export function transition(state: SyncState, event: SyncEvent, timing: Timing = DEFAULT_TIMING): Transition {
  if (event.type === "stop")
    return { state: { kind: "stopped" }, effects: [{ type: "clearTimer" }, { type: "close" }] };
  if (state.kind === "stopped" || state.kind === "rejected") return stay(state);
  if (event.type === "rejected")
    return { state: { kind: "rejected" }, effects: [{ type: "clearTimer" }, { type: "close" }] };

  switch (state.kind) {
    case "idle":
      return event.type === "start" ? connecting(0, event.enabled, timing) : stay(state);

    case "connecting":
      switch (event.type) {
        // Every connection starts with a join: its reply also says whether collaboration is on. Without
        // collaboration the local copy has no trusted sequence number, so the join asks for a snapshot.
        case "connected":
          return clearing(joining(state.attempt, state.enabled ? "connect" : "enable", state.enabled, timing));
        case "timeout":
        case "disconnected":
          return goOffline(state.attempt, state.enabled, timing);
        case "enable":
        case "disable":
          return stay({ ...state, enabled: event.type === "enable" });
        default:
          return stay(state);
      }

    case "standby":
      switch (event.type) {
        case "enable":
          return joining(0, "enable", true, timing);
        case "disconnected":
          return goOffline(0, false, timing);
        default:
          return stay(state);
      }

    case "joining":
      switch (event.type) {
        case "synced":
          return event.enabled
            ? { state: { kind: "live", gap: false }, effects: [{ type: "clearTimer" }, { type: "resendPending" }] }
            : standby;
        case "timeout":
        case "disconnected":
          return goOffline(state.attempt, state.enabled, timing);
        case "enable":
          return stay({ ...state, enabled: true });
        case "disable":
          return standby;
        default:
          return stay(state);
      }

    case "live":
      switch (event.type) {
        case "gapOpened":
          return state.gap
            ? stay(state)
            : { state: { kind: "live", gap: true }, effects: [{ type: "setTimer", ms: timing.gapWaitMs }] };
        case "gapClosed":
          return state.gap ? { state: { kind: "live", gap: false }, effects: [{ type: "clearTimer" }] } : stay(state);
        case "timeout":
          return state.gap ? joining(0, "gap", true, timing) : stay(state);
        case "overflow":
          return clearing(joining(0, "gap", true, timing));
        case "resume":
          return clearing(joining(0, "resume", true, timing));
        case "disconnected":
          return goOffline(0, true, timing);
        case "disable":
          return standby;
        default:
          return stay(state);
      }

    case "offline":
      switch (event.type) {
        // The socket came back on its own (the transport reconnected before the retry timer fired).
        case "connected":
          return clearing(joining(state.attempt, state.enabled ? "connect" : "enable", state.enabled, timing));
        case "timeout":
          return connecting(state.attempt, state.enabled, timing);
        case "resume":
          return clearing(connecting(state.attempt, state.enabled, timing));
        case "enable":
        case "disable":
          return stay({ ...state, enabled: event.type === "enable" });
        default:
          return stay(state);
      }
  }
}

/** The status shown next to the title while collaborating. */
export type SyncStatus = "connecting" | "syncing" | "live" | "offline" | "standby" | "rejected" | "stopped";

export function syncStatusOf(state: SyncState): SyncStatus {
  switch (state.kind) {
    case "idle":
      return "connecting";
    case "connecting":
      return state.attempt > 0 ? "offline" : "connecting";
    case "joining":
      return "syncing";
    default:
      return state.kind;
  }
}
