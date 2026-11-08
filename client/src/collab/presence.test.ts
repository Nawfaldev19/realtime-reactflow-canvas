import { describe, expect, it, vi } from "vitest";
import { memberColor } from "./colors";
import {
  applyPresence,
  avatarsOf,
  EMPTY_ROSTER,
  expire,
  EXPIRE_MS,
  isStale,
  peersInOrder,
  presenceLabel,
  STALE_MS,
  Throttle,
  type Roster,
} from "./presence";
import type { PresenceMessage } from "./protocol";

const SELF = "tab-self";
const presence = (sessionId: string, overrides: Partial<PresenceMessage> = {}): PresenceMessage => ({
  type: "presence",
  event: "update",
  sessionId,
  memberId: "7",
  name: "Ben Lindqvist",
  cursor: { x: 10, y: 20 },
  nodeId: null,
  editing: false,
  ...overrides,
});

function rosterOf(...messages: [PresenceMessage, number][]): Roster {
  return messages.reduce((roster, [message, at]) => applyPresence(roster, message, SELF, at), EMPTY_ROSTER);
}

describe("applyPresence", () => {
  it("adds a peer with the colour of their member id, in join order", () => {
    const roster = rosterOf(
      [presence("tab-b", { event: "join" }), 0],
      [presence("tab-c", { memberId: "9", name: "Cora Mbeki" }), 5],
    );

    expect(peersInOrder(roster).map((peer) => [peer.name, peer.order])).toEqual([
      ["Ben Lindqvist", 0],
      ["Cora Mbeki", 1],
    ]);
    expect(roster.peers["tab-b"]).toMatchObject(memberColor("7"));
  });

  it("updates a peer in place, keeping their order", () => {
    const roster = rosterOf(
      [presence("tab-b"), 0],
      [presence("tab-c"), 1],
      [presence("tab-b", { cursor: null, nodeId: "n4", editing: true }), 2],
    );

    expect(roster.peers["tab-b"]).toMatchObject({ cursor: null, nodeId: "n4", editing: true, order: 0, updatedAt: 2 });
    expect(roster.nextOrder).toBe(2);
  });

  it("never lists this tab's own session", () => {
    expect(rosterOf([presence(SELF), 0])).toBe(EMPTY_ROSTER);
  });

  it("removes a peer that leaves, at once", () => {
    const roster = rosterOf([presence("tab-b"), 0], [presence("tab-b", { event: "leave" }), 1]);

    expect(roster.peers).toEqual({});
    expect(applyPresence(roster, presence("tab-x", { event: "leave" }), SELF, 2)).toBe(roster);
  });
});

describe("staleness", () => {
  it("fades a cursor that has not moved for 10 s, even while heartbeats arrive", () => {
    const roster = rosterOf([presence("tab-b"), 0], [presence("tab-b"), 9000]);
    const peer = roster.peers["tab-b"];
    if (!peer) throw new Error("missing peer");

    expect(peer.movedAt).toBe(0);
    expect(isStale(peer, STALE_MS)).toBe(false);
    expect(isStale(peer, STALE_MS + 1)).toBe(true);
    const moved = applyPresence(roster, presence("tab-b", { cursor: { x: 11, y: 20 } }), SELF, 12_000).peers["tab-b"];
    expect(moved?.movedAt).toBe(12_000);
  });

  it("drops a peer silent for 30 s", () => {
    const roster = rosterOf([presence("tab-b"), 0], [presence("tab-c"), 20_000]);

    expect(expire(roster, EXPIRE_MS)).toBe(roster);
    expect(Object.keys(expire(roster, EXPIRE_MS + 1).peers)).toEqual(["tab-c"]);
  });
});

describe("avatarsOf", () => {
  it("lists the current member first, then one avatar per member with a tab count", () => {
    const roster = rosterOf(
      [presence("tab-c", { memberId: "9", name: "Cora Mbeki", nodeId: "n2" }), 0],
      [presence("tab-b1"), 1],
      [presence("tab-b2", { nodeId: "n5" }), 2],
      [presence("tab-a2", { memberId: "1", name: "Ada Okafor" }), 3],
    );
    const avatars = avatarsOf(roster, { memberId: "1", name: "Ada Okafor" });

    expect(avatars.map((avatar) => [avatar.name, avatar.sessions, avatar.self, avatar.nodeIds])).toEqual([
      ["Ada Okafor", 2, true, []],
      ["Cora Mbeki", 1, false, ["n2"]],
      ["Ben Lindqvist", 2, false, ["n5"]],
    ]);
  });
});

describe("presenceLabel", () => {
  it("names the step by its short number", () => {
    expect(presenceLabel("Ada Okafor", 12)).toBe("Ada Okafor · Step 12");
    expect(presenceLabel("Ada Okafor", null)).toBe("Ada Okafor");
  });
});

describe("Throttle", () => {
  function setup() {
    let now = 0;
    const timers: { at: number; callback: () => void; handle: number }[] = [];
    let next = 1;
    const clock = {
      now: () => now,
      setTimeout: (callback: () => void, ms: number) => {
        const handle = next++;
        timers.push({ at: now + ms, callback, handle });
        return handle as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (handle: ReturnType<typeof setTimeout>) => {
        const index = timers.findIndex((timer) => timer.handle === (handle as unknown as number));
        if (index >= 0) timers.splice(index, 1);
      },
    };
    const advance = (ms: number) => {
      now += ms;
      for (const timer of timers.filter((entry) => entry.at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.callback();
      }
    };
    const send = vi.fn();
    return { throttle: new Throttle<number>(send, 50, clock), send, advance, timers };
  }

  it("sends the first value at once and then at most every interval, latest value first", () => {
    const { throttle, send, advance } = setup();
    throttle.push(1);
    throttle.push(2);
    throttle.push(3);
    expect(send.mock.calls).toEqual([[1]]);

    advance(49);
    expect(send).toHaveBeenCalledTimes(1);
    advance(1);
    expect(send.mock.calls).toEqual([[1], [3]]);
  });

  it("caps the rate at 20 per second under constant movement", () => {
    const { throttle, send, advance } = setup();
    for (let ms = 0; ms < 1000; ms += 5) {
      throttle.push(ms);
      advance(5);
    }
    expect(send.mock.calls.length).toBeLessThanOrEqual(21);
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(19);
  });

  it("flushes a waiting value at once, and cancel drops it", () => {
    const { throttle, send, advance, timers } = setup();
    throttle.push(1);
    throttle.push(2);
    throttle.flush();
    expect(send.mock.calls).toEqual([[1], [2]]);
    expect(timers).toHaveLength(0);

    throttle.flush();
    advance(100);
    throttle.push(3);
    throttle.push(4);
    throttle.cancel();
    advance(100);
    expect(send.mock.calls).toEqual([[1], [2], [3]]);
  });
});
