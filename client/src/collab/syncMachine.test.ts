import { describe, expect, it } from "vitest";
import {
  backoffDelay,
  BASE_BACKOFF_MS,
  IDLE,
  isCollaborating,
  MAX_BACKOFF_MS,
  syncStatusOf,
  transition,
  type SyncEvent,
  type SyncState,
  type Timing,
} from "./syncMachine";

const TIMING: Timing = { connectTimeoutMs: 100, joinTimeoutMs: 200, gapWaitMs: 50, random: () => 0.5 };

function run(events: readonly SyncEvent[], from: SyncState = IDLE) {
  let state = from;
  const effects = [];
  for (const event of events) {
    const next = transition(state, event, TIMING);
    state = next.state;
    effects.push(...next.effects);
  }
  return { state, effects };
}

const LIVE: SyncState = { kind: "live", gap: false };

describe("backoffDelay", () => {
  it("doubles from half a second up to 30 seconds", () => {
    const middle = () => 0.5;

    expect([0, 1, 2, 3, 4, 5, 6, 7].map((attempt) => backoffDelay(attempt, middle))).toEqual([
      500, 1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
    expect(backoffDelay(40, middle)).toBe(MAX_BACKOFF_MS);
  });

  it("adds at most 20% jitter either way", () => {
    expect(backoffDelay(0, () => 0)).toBe(BASE_BACKOFF_MS * 0.8);
    expect(backoffDelay(0, () => 0.999999)).toBe(BASE_BACKOFF_MS * 1.2);
    expect(backoffDelay(10, () => 0)).toBe(24_000);
  });
});

describe("transition: connecting and joining", () => {
  it("opens the socket with a connect timeout, then joins from its last sequence number", () => {
    const opened = transition(IDLE, { type: "start", enabled: true }, TIMING);
    expect(opened.state).toEqual({ kind: "connecting", attempt: 0, enabled: true });
    expect(opened.effects).toEqual([{ type: "open" }, { type: "setTimer", ms: 100 }]);

    const joined = transition(opened.state, { type: "connected" }, TIMING);
    expect(joined.state).toEqual({ kind: "joining", attempt: 0, reason: "connect", enabled: true });
    expect(joined.effects).toEqual([
      { type: "clearTimer" },
      { type: "join", fromScratch: false },
      { type: "setTimer", ms: 200 },
    ]);
  });

  it("goes live after the reply and re-sends what is pending", () => {
    const { state, effects } = run([{ type: "synced", enabled: true }], {
      kind: "joining",
      attempt: 2,
      reason: "connect",
      enabled: true,
    });

    expect(state).toEqual(LIVE);
    expect(effects).toEqual([{ type: "clearTimer" }, { type: "resendPending" }]);
  });

  it("asks for a snapshot when collaboration was off, and waits in standby if it still is", () => {
    const joining = run([{ type: "start", enabled: false }, { type: "connected" }]);
    expect(joining.state).toEqual({ kind: "joining", attempt: 0, reason: "enable", enabled: false });
    expect(joining.effects).toContainEqual({ type: "join", fromScratch: true });
    expect(isCollaborating(joining.state)).toBe(false);

    expect(run([{ type: "synced", enabled: false }], joining.state).state).toEqual({ kind: "standby" });
    expect(run([{ type: "synced", enabled: true }], joining.state).state).toEqual(LIVE);
  });

  it("follows the switch while connecting or joining", () => {
    const connecting = run([{ type: "start", enabled: true }, { type: "disable" }]).state;
    expect(connecting).toEqual({ kind: "connecting", attempt: 0, enabled: false });
    expect(run([{ type: "enable" }], connecting).state).toEqual({ kind: "connecting", attempt: 0, enabled: true });

    const joining: SyncState = { kind: "joining", attempt: 0, reason: "enable", enabled: false };
    expect(run([{ type: "enable" }], joining).state).toEqual({ ...joining, enabled: true });
    expect(run([{ type: "disable" }], joining).state).toEqual({ kind: "standby" });
  });

  it("ignores events that do not apply", () => {
    for (const [state, event] of [
      [IDLE, { type: "connected" }],
      [
        { kind: "connecting", attempt: 0, enabled: true },
        { type: "synced", enabled: true },
      ],
      [{ kind: "standby" }, { type: "timeout" }],
      [{ kind: "joining", attempt: 0, reason: "gap", enabled: true }, { type: "gapOpened" }],
      [LIVE, { type: "synced", enabled: true }],
      [LIVE, { type: "timeout" }],
      [LIVE, { type: "gapClosed" }],
      [
        { kind: "offline", attempt: 1, enabled: true },
        { type: "synced", enabled: true },
      ],
    ] as [SyncState, SyncEvent][]) {
      expect(transition(state, event, TIMING)).toEqual({ state, effects: [] });
    }
  });
});

describe("transition: failures and reconnects", () => {
  it("backs off after a connect timeout, a failed join or a dropped socket", () => {
    const fromConnecting = run([{ type: "timeout" }], { kind: "connecting", attempt: 0, enabled: true });
    expect(fromConnecting.state).toEqual({ kind: "offline", attempt: 1, enabled: true });
    expect(fromConnecting.effects).toEqual([{ type: "close" }, { type: "setTimer", ms: 500 }]);

    expect(
      run([{ type: "disconnected" }], { kind: "joining", attempt: 3, reason: "connect", enabled: true }).state,
    ).toEqual({ kind: "offline", attempt: 4, enabled: true });
    expect(
      run([{ type: "timeout" }], { kind: "joining", attempt: 3, reason: "connect", enabled: true }).effects,
    ).toContainEqual({ type: "setTimer", ms: 4000 });
    expect(run([{ type: "disconnected" }], LIVE).state).toEqual({ kind: "offline", attempt: 1, enabled: true });
    expect(run([{ type: "disconnected" }], { kind: "standby" }).state).toEqual({
      kind: "offline",
      attempt: 1,
      enabled: false,
    });
  });

  it("retries when the backoff timer fires, growing the delay until a connection succeeds", () => {
    const { state, effects } = run([{ type: "timeout" }, { type: "disconnected" }, { type: "timeout" }], {
      kind: "offline",
      attempt: 1,
      enabled: true,
    });

    expect(state).toEqual({ kind: "connecting", attempt: 2, enabled: true });
    expect(effects.filter((effect) => effect.type === "setTimer").map((effect) => effect.ms)).toEqual([100, 1000, 100]);
    expect(syncStatusOf(state)).toBe("offline");

    const back = run([{ type: "connected" }, { type: "synced", enabled: true }], state);
    expect(back.state).toEqual(LIVE);
    expect(run([{ type: "disconnected" }], back.state).effects).toContainEqual({ type: "setTimer", ms: 500 });
  });

  it("retries at once when the browser comes back online", () => {
    const { state, effects } = run([{ type: "resume" }], { kind: "offline", attempt: 3, enabled: true });

    expect(state).toEqual({ kind: "connecting", attempt: 3, enabled: true });
    expect(effects).toEqual([{ type: "clearTimer" }, { type: "open" }, { type: "setTimer", ms: 100 }]);
  });

  it("joins when the socket comes back on its own while waiting", () => {
    const { state, effects } = run([{ type: "connected" }], { kind: "offline", attempt: 2, enabled: false });

    expect(state).toEqual({ kind: "joining", attempt: 2, reason: "enable", enabled: false });
    expect(effects[0]).toEqual({ type: "clearTimer" });
  });

  it("remembers the switch while offline", () => {
    const offline: SyncState = { kind: "offline", attempt: 1, enabled: true };

    expect(run([{ type: "disable" }], offline).state).toEqual({ ...offline, enabled: false });
    expect(run([{ type: "disable" }, { type: "enable" }], offline).state).toEqual(offline);
  });
});

describe("transition: gaps", () => {
  it("waits a moment for missing operations, then resynchronizes from the last applied number", () => {
    const waiting = run([{ type: "gapOpened" }, { type: "gapOpened" }], LIVE);
    expect(waiting.state).toEqual({ kind: "live", gap: true });
    expect(waiting.effects).toEqual([{ type: "setTimer", ms: 50 }]);

    const resync = run([{ type: "timeout" }], waiting.state);
    expect(resync.state).toEqual({ kind: "joining", attempt: 0, reason: "gap", enabled: true });
    expect(resync.effects).toContainEqual({ type: "join", fromScratch: false });
  });

  it("stops waiting when the gap fills", () => {
    const { state, effects } = run([{ type: "gapOpened" }, { type: "gapClosed" }], LIVE);

    expect(state).toEqual(LIVE);
    expect(effects).toEqual([{ type: "setTimer", ms: 50 }, { type: "clearTimer" }]);
  });

  it("resynchronizes at once on overflow or after a long absence", () => {
    expect(run([{ type: "overflow" }], { kind: "live", gap: true }).effects).toEqual([
      { type: "clearTimer" },
      { type: "join", fromScratch: false },
      { type: "setTimer", ms: 200 },
    ]);
    expect(run([{ type: "resume" }], LIVE).state).toEqual({
      kind: "joining",
      attempt: 0,
      reason: "resume",
      enabled: true,
    });
  });
});

describe("transition: the collaboration switch", () => {
  it("leaves the room's operations for autosave when switched off, and asks for a snapshot when switched on", () => {
    const off = run([{ type: "disable" }], LIVE);
    expect(off).toEqual({ state: { kind: "standby" }, effects: [{ type: "clearTimer" }] });
    expect(isCollaborating(off.state)).toBe(false);

    const on = run([{ type: "enable" }], off.state);
    expect(on.state).toEqual({ kind: "joining", attempt: 0, reason: "enable", enabled: true });
    expect(on.effects).toContainEqual({ type: "join", fromScratch: true });
    expect(isCollaborating(on.state)).toBe(true);
  });
});

describe("transition: final states", () => {
  it("stops from anywhere, closing the socket", () => {
    for (const state of [
      IDLE,
      LIVE,
      { kind: "offline", attempt: 2, enabled: true },
      { kind: "rejected" },
    ] as SyncState[]) {
      expect(transition(state, { type: "stop" }, TIMING)).toEqual({
        state: { kind: "stopped" },
        effects: [{ type: "clearTimer" }, { type: "close" }],
      });
    }
  });

  it("treats a rejected subscription as final", () => {
    const rejected = run([{ type: "rejected" }], { kind: "connecting", attempt: 0, enabled: true });

    expect(rejected.state).toEqual({ kind: "rejected" });
    expect(run([{ type: "start", enabled: true }, { type: "connected" }], rejected.state).state).toEqual({
      kind: "rejected",
    });
    expect(run([{ type: "connected" }], { kind: "stopped" }).state).toEqual({ kind: "stopped" });
  });

  it("uses the default timing when none is given", () => {
    expect(transition(IDLE, { type: "start", enabled: true }).effects).toContainEqual({ type: "setTimer", ms: 8000 });
  });
});

describe("status", () => {
  it("names each state for the status label", () => {
    expect(syncStatusOf(IDLE)).toBe("connecting");
    expect(syncStatusOf({ kind: "connecting", attempt: 0, enabled: true })).toBe("connecting");
    expect(syncStatusOf({ kind: "joining", attempt: 0, reason: "gap", enabled: true })).toBe("syncing");
    expect(syncStatusOf(LIVE)).toBe("live");
    expect(syncStatusOf({ kind: "offline", attempt: 1, enabled: true })).toBe("offline");
    expect(syncStatusOf({ kind: "standby" })).toBe("standby");
    expect(syncStatusOf({ kind: "rejected" })).toBe("rejected");
    expect(syncStatusOf({ kind: "stopped" })).toBe("stopped");
  });

  it("collaborates only while collaboration is on", () => {
    expect(isCollaborating(IDLE)).toBe(false);
    expect(isCollaborating({ kind: "offline", attempt: 1, enabled: true })).toBe(true);
    expect(isCollaborating({ kind: "connecting", attempt: 0, enabled: false })).toBe(false);
    expect(isCollaborating({ kind: "rejected" })).toBe(false);
  });
});
