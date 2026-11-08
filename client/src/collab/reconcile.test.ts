import { describe, expect, it } from "vitest";
import { applyOperation, type Operation } from "../document/operations";
import { edge, node, stateOf } from "../test/fixtures";
import type { OpMessage } from "./protocol";
import {
  clientOpIdOf,
  dropPending,
  rebase,
  receiveOps,
  receiveSnapshot,
  shareUnchanged,
  type Replica,
} from "./reconcile";

const SELF = "tab-self";
const move = (id: string, x: number): Operation => ({ type: "node.update", id, fields: { position: { x, y: 0 } } });
const message = (seq: number, op: Operation, sessionId = "tab-peer", clientOpId = String(seq)): OpMessage => ({
  type: "op",
  seq,
  sessionId,
  clientOpId,
  memberId: "1",
  op,
});

function replicaWith(pendingOps: readonly Operation[]): Replica {
  const confirmed = stateOf([node("a"), node("b", { number: 2 })], [edge("ab", "a", "b")]);
  const pending = pendingOps.map((op, index) => ({ seq: index + 1, op }));
  return { confirmed, pending, visible: rebase(confirmed, pending, confirmed) };
}

describe("receiveOps", () => {
  it("applies a remote operation under the pending ones, so neither hides the other", () => {
    const replica = replicaWith([move("a", 50)]);
    const {
      replica: next,
      acknowledged,
      remote,
    } = receiveOps(replica, [message(1, { type: "node.update", id: "a", fields: { data: { text: "Cut" } } })], SELF);

    expect(remote).toBe(1);
    expect(acknowledged).toEqual([]);
    expect(next.confirmed.nodes.a?.data).toEqual({ text: "Cut" });
    expect(next.confirmed.nodes.a?.position).toEqual({ x: 0, y: 0 });
    expect(next.visible.nodes.a).toMatchObject({ position: { x: 50, y: 0 }, data: { text: "Cut" } });
    expect(next.pending).toHaveLength(1);
  });

  it("returns the very same visible document for its own echo in order (no re-render)", () => {
    const replica = replicaWith([move("a", 50), move("b", 70)]);
    const { replica: next, acknowledged } = receiveOps(
      replica,
      [message(1, move("a", 50), SELF, clientOpIdOf(1))],
      SELF,
    );

    expect(acknowledged).toEqual([1]);
    expect(next.visible).toBe(replica.visible);
    expect(next.pending.map((entry) => entry.seq)).toEqual([2]);
    expect(next.confirmed.nodes.a?.position).toEqual({ x: 50, y: 0 });
  });

  it("matches echoes by session and client operation id, never by member", () => {
    const replica = replicaWith([move("a", 50)]);
    const otherTab = receiveOps(replica, [message(1, move("a", 9), "tab-other", clientOpIdOf(1))], SELF);

    expect(otherTab.acknowledged).toEqual([]);
    expect(otherTab.remote).toBe(1);
    expect(otherTab.replica.visible.nodes.a?.position).toEqual({ x: 50, y: 0 });
  });

  it("rebases when an echo arrives out of the local order", () => {
    const replica = replicaWith([move("a", 50), move("a", 60)]);
    const { replica: next, acknowledged } = receiveOps(
      replica,
      [message(1, move("a", 60), SELF, clientOpIdOf(2))],
      SELF,
    );

    expect(acknowledged).toEqual([2]);
    expect(next.visible).not.toBe(replica.visible);
    // The server applied 60 first, so the remaining pending 50 now lands on top.
    expect(next.visible.nodes.a?.position).toEqual({ x: 50, y: 0 });
  });

  it("skips a pending change whose target a peer removed, and shows the removal", () => {
    const replica = replicaWith([move("a", 50)]);
    const { replica: next } = receiveOps(replica, [message(1, { type: "node.remove", id: "a" })], SELF);

    expect(next.visible.nodes.a).toBeUndefined();
    expect(next.visible.edges.ab).toBeUndefined();
    expect(next.pending).toHaveLength(1);
  });

  it("changes nothing for an empty list", () => {
    const replica = replicaWith([]);

    expect(receiveOps(replica, [], SELF)).toEqual({ replica, acknowledged: [], remote: 0 });
  });
});

describe("receiveSnapshot and dropPending", () => {
  it("replays pending operations on a resync snapshot", () => {
    const replica = replicaWith([move("a", 50)]);
    const snapshot = stateOf([node("a", { data: { text: "From the server" } })]);
    const next = receiveSnapshot(replica, snapshot);

    expect(next.confirmed).toBe(snapshot);
    expect(next.visible.nodes).toEqual({ a: { ...snapshot.nodes.a, position: { x: 50, y: 0 } } });
    expect(next.pending).toBe(replica.pending);
  });

  it("removes a refused operation and shows the document without it", () => {
    const replica = replicaWith([move("a", 50), move("b", 70)]);
    const next = dropPending(replica, 1);

    expect(next.pending.map((entry) => entry.seq)).toEqual([2]);
    expect(next.visible.nodes.a?.position).toEqual({ x: 0, y: 0 });
    expect(next.visible.nodes.b?.position).toEqual({ x: 70, y: 0 });
    expect(next.visible.edges).toBe(replica.visible.edges);
    expect(dropPending(next, 9)).toBe(next);
  });
});

describe("shareUnchanged", () => {
  it("keeps the previous objects for entities equal in value", () => {
    const previous = stateOf([node("a"), node("b")], [edge("ab", "a", "b")]);
    const next = applyOperation(
      { ...previous, nodes: { a: { ...node("a") }, b: previous.nodes.b ?? node("b") } },
      move("b", 30),
    ).state;
    const shared = shareUnchanged(previous, next);

    expect(shared.nodes.a).toBe(previous.nodes.a);
    expect(shared.nodes.b).not.toBe(previous.nodes.b);
    expect(shared.edges).toBe(previous.edges);
  });

  it("returns the previous document when nothing differs in value", () => {
    const previous = stateOf([node("a")], [], 4);
    const copy = { nodes: { a: { ...node("a") } }, edges: {}, nextNumber: 4, layout: null };

    expect(shareUnchanged(previous, copy)).toBe(previous);
    expect(shareUnchanged(previous, previous)).toBe(previous);
  });

  it("notices added and removed entities, the counter and the layout", () => {
    const previous = stateOf([node("a"), node("b")]);
    const removed = shareUnchanged(previous, stateOf([node("a")], [], previous.nextNumber));
    expect(Object.keys(removed.nodes)).toEqual(["a"]);
    expect(removed.nodes.a).toBe(previous.nodes.a);

    expect(shareUnchanged(previous, { ...previous, nextNumber: 9 }).nextNumber).toBe(9);
    const layout = { engine: "dagre", direction: "TB", manual: { nodes: {}, edges: {} } } as const;
    expect(shareUnchanged(previous, { ...previous, layout }).layout).toBe(layout);
    const withLayout = { ...previous, layout };
    expect(shareUnchanged(withLayout, { ...previous, layout: { ...layout } })).toBe(withLayout);
  });
});
