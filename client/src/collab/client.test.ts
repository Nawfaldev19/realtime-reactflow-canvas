import { describe, expect, it, vi } from "vitest";
import { jsonEqual, type Operation } from "../document/operations";
import { serializeDocument } from "../document/serialize";
import type { DocumentState } from "../document/types";
import { createEditorStore } from "../editor/store";
import { FakeRoom } from "../test/fakeRoom";
import { edge, node, stateOf } from "../test/fixtures";
import { manualClock } from "../test/manualClock";
import { seededRandom } from "../test/random";
import { CollabClient, type Transport } from "./client";
import { HEARTBEAT_MS } from "./presence";

const ADA = { memberId: "1", name: "Ada Okafor" };
const BEN = { memberId: "2", name: "Ben Lindqvist" };
const CORA = { memberId: "3", name: "Cora Mbeki" };

const START = stateOf(
  [
    node("a", { number: 1 }),
    node("b", { number: 2, position: { x: 200, y: 0 } }),
    node("c", { number: 3, position: { x: 400, y: 0 } }),
  ],
  [edge("ab", "a", "b")],
);

const move = (id: string, x: number): Operation => ({ type: "node.update", id, fields: { position: { x, y: 0 } } });

function setup({ enabled = true, document = START }: { enabled?: boolean; document?: DocumentState } = {}) {
  const room = new FakeRoom({ document: serializeDocument(document), enabled });
  const time = manualClock(1_000_000);
  const join = (
    member: typeof ADA,
    { canEdit = true, beforeEnable }: { canEdit?: boolean; beforeEnable?: () => Promise<void> } = {},
  ) => {
    const store = createEditorStore();
    store.getState().load({
      id: "d1",
      title: "Plan",
      revision: room.revision,
      document: room.document,
      canEdit,
      collaborationEnabled: room.enabled,
    });
    const transport = room.transport({ ...member, canEdit });
    let opened: Transport | null = null;
    const client = new CollabClient({
      store,
      transport: (target, handlers) => (opened = transport(target, handlers)),
      clock: time.clock,
      timing: { random: () => 0.5 },
      ...(beforeEnable ? { beforeEnable } : {}),
    });
    client.start();
    return {
      store,
      client,
      /** The session id the room assigned in its last sync reply. */
      get sessionId() {
        return store.getState().sessionId;
      },
      socket: () => [...room.sockets].find((socket) => socket === opened),
    };
  };
  return { room, time, join };
}

const docOf = (store: ReturnType<typeof createEditorStore>) =>
  JSON.parse(JSON.stringify(serializeDocument(store.getState().doc))) as unknown;
const roomDoc = (room: FakeRoom) => JSON.parse(JSON.stringify(room.document)) as unknown;

describe("CollabClient: joining", () => {
  it("connects, joins from the loaded revision and goes live", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    expect(ada.store.getState().syncStatus).toBe("connecting");
    expect(ada.store.getState().saveStatus).toEqual({ kind: "syncing" });

    room.settle();

    expect(ada.client.state).toEqual({ kind: "live", gap: false });
    expect(ada.store.getState()).toMatchObject({
      syncStatus: "live",
      collaborating: true,
      saveStatus: { kind: "idle" },
    });
    expect(ada.client.presence.getState().self).toEqual({
      sessionId: ada.sessionId,
      memberId: "1",
      name: "Ada Okafor",
    });
  });

  it("catches up with operations made before it joined", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    ada.store.getState().apply(move("a", 40));
    const ben = join(BEN);
    room.settle();

    expect(ben.store.getState().doc.nodes.a?.position).toEqual({ x: 40, y: 0 });
    expect(ben.store.getState().revision).toBe(1);
  });
});

describe("CollabClient: operations", () => {
  it("sends a local edit, which every client then holds; the server persisted it", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();

    ada.store.getState().apply(move("a", 75));
    expect(ada.store.getState().saveStatus).toEqual({ kind: "saving" });
    const visible = ada.store.getState().doc;
    room.settle();

    expect(ben.store.getState().doc.nodes.a?.position).toEqual({ x: 75, y: 0 });
    expect(ada.store.getState().pending).toEqual([]);
    expect(ada.store.getState().doc).toBe(visible);
    expect(ada.store.getState().saveStatus).toMatchObject({ kind: "saved" });
    expect(room.state.nodes.a?.position).toEqual({ x: 75, y: 0 });
  });

  it("does not notify subscribers again for its own echo", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    ada.store.getState().apply(move("a", 75));
    room.process();
    const docChanges = vi.fn();
    const unsubscribe = ada.store.subscribe((next, previous) => {
      if (next.doc !== previous.doc) docChanges();
    });
    room.deliver();
    unsubscribe();

    expect(docChanges).not.toHaveBeenCalled();
    expect(ada.store.getState().revision).toBe(1);
  });

  it("keeps both changes when two people change different fields of one step at once", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();

    ada.store.getState().apply(move("b", 260));
    ben.store.getState().apply({ type: "node.update", id: "b", fields: { data: { text: "Sand to 220 grit" } } });
    room.settle();

    for (const store of [ada.store, ben.store])
      expect(store.getState().doc.nodes.b).toMatchObject({
        position: { x: 260, y: 0 },
        data: { text: "Sand to 220 grit" },
      });
    expect(docOf(ada.store)).toEqual(docOf(ben.store));
  });

  it("sends a removed data key so peers remove it too", () => {
    const { room, join } = setup({ document: stateOf([node("a", { data: { text: "a", color: "#336699" } })]) });
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();

    ada.store.getState().apply({ type: "node.update", id: "a", fields: { data: { color: undefined } } });
    room.settle();

    expect(ben.store.getState().doc.nodes.a?.data).toEqual({ text: "a" });
    expect(docOf(ada.store)).toEqual(docOf(ben.store));
  });

  it("drops a refused change, shows why, and keeps the rest", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    room.refuse = (op) => ((op as { id?: string }).id === "a" ? "This change would make the diagram invalid" : null);

    ada.store.getState().apply(move("a", 10));
    ada.store.getState().apply(move("b", 20));
    expect(ada.store.getState().doc.nodes.a?.position).toEqual({ x: 10, y: 0 });
    room.settle();

    expect(ada.store.getState().pending).toEqual([]);
    expect(ada.store.getState().doc.nodes.a?.position).toEqual({ x: 0, y: 0 });
    expect(ada.store.getState().doc.nodes.b?.position).toEqual({ x: 20, y: 0 });
    expect(ada.store.getState().collabNotice).toEqual({
      kind: "refused",
      message: "A change could not be saved: This change would make the diagram invalid",
    });
    expect(docOf(ada.store)).toEqual(roomDoc(room));
  });

  it("ignores a refusal for a change it no longer has", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    ada.socket()?.handlers.received({ type: "rejected", clientOpId: "41", code: "INVALID", message: "No" });

    expect(ada.store.getState().collabNotice).toBeNull();
  });

  it("refuses a viewer's operations on the server", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    const forged = join(CORA, { canEdit: true });
    room.settle();
    const socket = forged.socket();
    if (!socket) throw new Error("no socket");
    Object.assign(socket, { member: { ...CORA, canEdit: false } });

    forged.store.getState().apply(move("c", 999));
    room.settle();

    expect(forged.store.getState().doc.nodes.c?.position).toEqual({ x: 400, y: 0 });
    expect(forged.store.getState().collabNotice?.message).toMatch(/does not allow editing/);
    expect(ada.store.getState().doc.nodes.c?.position).toEqual({ x: 400, y: 0 });
    expect(room.revision).toBe(0);
  });

  it("converges for three clients making random concurrent edits to the same five steps (property)", () => {
    const steps = ["a", "b", "c", "d", "e"];
    const document = stateOf(
      steps.map((id, index) => node(id, { number: index + 1, position: { x: index * 200, y: 0 } })),
      [edge("ab", "a", "b"), edge("cd", "c", "d")],
    );
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { room, time, join } = setup({ document });
      const clients = [join(ADA), join(BEN), join(CORA)];
      room.settle();
      const random = seededRandom(seed);
      for (let round = 0; round < 10; round += 1) {
        for (const [index, { store }] of clients.entries()) {
          const id = random.pick(steps);
          const choice = random.int(5);
          if (choice === 0) store.getState().apply(move(id, random.int(1000)));
          else if (choice === 1)
            store
              .getState()
              .apply({ type: "node.update", id, fields: { data: { text: `edit ${String(index)}-${String(round)}` } } });
          else if (choice === 2) store.getState().apply({ type: "node.update", id, fields: { z: random.int(9) } });
          else if (choice === 3) store.getState().deleteElements([id], []);
          else store.getState().connect(id, random.pick(steps));
        }
        room.process(random.int);
        room.deliver(random.int);
        time.advance(random.int(1500));
      }
      for (let pass = 0; pass < 10; pass += 1) {
        room.settle();
        time.advance(1000);
      }

      for (const { store } of clients) {
        expect(store.getState().pending).toEqual([]);
        expect(docOf(store)).toEqual(roomDoc(room));
      }
    }
  });
});

describe("CollabClient: gaps and reconnects", () => {
  it("waits for a missing operation, then resynchronizes from its last number", () => {
    const { room, time, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();

    ada.store.getState().apply(move("a", 10));
    ada.store.getState().apply(move("b", 20));
    room.process();
    const lost = room.outbox.findIndex(
      (delivery) =>
        delivery.socket === ben.socket() &&
        delivery.kind === "message" &&
        (delivery.data as { seq?: number }).seq === 1,
    );
    room.outbox.splice(lost, 1);
    room.deliver();

    expect(ben.client.state).toEqual({ kind: "live", gap: true });
    expect(ben.store.getState().doc.nodes.b?.position).toEqual({ x: 200, y: 0 });
    time.advance(1000);
    expect(ben.client.state.kind).toBe("joining");
    room.settle();

    expect(ben.client.state).toEqual({ kind: "live", gap: false });
    expect(docOf(ben.store)).toEqual(roomDoc(room));
    expect(ben.store.getState().revision).toBe(2);
  });

  it("reorders operations that arrive out of order without resynchronizing", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();
    ada.store.getState().apply(move("a", 10));
    ada.store.getState().apply(move("a", 30));
    room.process();
    room.deliver(() => room.outbox.length - 1);

    expect(ben.store.getState().doc.nodes.a?.position).toEqual({ x: 30, y: 0 });
    expect(ben.client.state).toEqual({ kind: "live", gap: false });
    expect(room.requests).toHaveLength(0);
  });

  it("queues edits while the server is away and syncs both ways when it is back", () => {
    const { room, time, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();
    const socket = ada.socket();
    if (!socket) throw new Error("no socket");

    room.online = false;
    room.drop(socket);
    room.deliver();
    expect(ada.store.getState()).toMatchObject({ syncStatus: "offline", saveStatus: { kind: "offline" } });
    for (const [index, id] of ["a", "b", "c", "a", "b"].entries()) ada.store.getState().apply(move(id, 1000 + index));
    for (const [index, id] of ["c", "b", "a", "c", "b"].entries())
      ben.store.getState().apply({ type: "node.update", id, fields: { data: { text: `Ben ${String(index)}` } } });
    room.settle();

    time.advance(500);
    room.deliver();
    expect(ada.client.state).toMatchObject({ kind: "offline", attempt: 2 });
    room.online = true;
    time.advance(1000);
    room.settle();

    expect(ada.client.state).toEqual({ kind: "live", gap: false });
    expect(room.revision).toBe(10);
    for (const store of [ada.store, ben.store]) {
      expect(store.getState().pending).toEqual([]);
      expect(docOf(store)).toEqual(roomDoc(room));
    }
    expect(ada.store.getState().doc.nodes.b).toMatchObject({ position: { x: 1004, y: 0 }, data: { text: "Ben 4" } });
  });

  it("does not apply a change twice when it reached the server just before the socket dropped", () => {
    const { room, time, join } = setup();
    const ada = join(ADA);
    room.settle();
    ada.store.getState().apply({ type: "node.add", node: node("n9", { number: 9 }) });
    room.process();
    const socket = ada.socket();
    if (!socket) throw new Error("no socket");
    room.outbox.splice(0, room.outbox.length);
    room.drop(socket);
    room.deliver();
    // The log no longer covers the gap, so the join gets a snapshot and the change is re-sent.
    room.log.splice(0, room.log.length);
    time.advance(500);
    room.settle();

    expect(ada.store.getState().pending).toEqual([]);
    expect(room.revision).toBe(1);
    expect(docOf(ada.store)).toEqual(roomDoc(room));
  });

  it("catches up after a long absence", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    ada.client.resume();

    expect(ada.client.state.kind).toBe("joining");
    room.settle();
    expect(ada.client.state.kind).toBe("live");
  });

  it("falls back to autosave when the room refuses the subscription", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    const socket = ada.socket();
    if (!socket) throw new Error("no socket");
    room.outbox.splice(0, room.outbox.length);
    socket.handlers.rejected();

    expect(ada.store.getState()).toMatchObject({ collaborating: false, syncStatus: "rejected" });
  });

  it("resolves whenSynced once every change is acknowledged, or after the timeout", async () => {
    const { room, time, join } = setup();
    const ada = join(ADA);
    room.settle();
    await ada.client.whenSynced();

    ada.store.getState().apply(move("a", 5));
    const synced = vi.fn();
    void ada.client.whenSynced().then(synced);
    room.settle();
    await Promise.resolve();
    expect(synced).toHaveBeenCalled();

    room.online = false;
    const socket = ada.socket();
    if (socket) room.drop(socket);
    room.deliver();
    ada.store.getState().apply(move("a", 6));
    const late = vi.fn();
    void ada.client.whenSynced(2000).then(late);
    time.advance(2000);
    await Promise.resolve();
    expect(late).toHaveBeenCalled();

    ada.store.getState().apply(move("a", 7));
    const stopped = vi.fn();
    void ada.client.whenSynced().then(stopped);
    ada.client.stop();
    await Promise.resolve();
    expect(stopped).toHaveBeenCalled();
  });
});

describe("CollabClient: undo over the operation stream", () => {
  it("undoes only this person's change: A's move is undone, B's note text stays", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();

    ada.store.getState().apply(move("a", 300));
    room.settle();
    ben.store.getState().apply({ type: "node.update", id: "a", fields: { data: { text: "Pare the tenons" } } });
    room.settle();
    expect(ada.store.getState().undo()).toBe(true);
    room.settle();

    for (const store of [ada.store, ben.store])
      expect(store.getState().doc.nodes.a).toMatchObject({
        position: { x: 0, y: 0 },
        data: { text: "Pare the tenons" },
      });
    expect(ben.store.getState().history.past).toHaveLength(1);
    expect(ada.store.getState().redo()).toBe(true);
    room.settle();
    expect(ben.store.getState().doc.nodes.a?.position).toEqual({ x: 300, y: 0 });
  });

  it("skips a field a collaborator changed after this person", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();
    ada.store.getState().apply(move("a", 300));
    room.settle();
    ben.store.getState().apply(move("a", 500));
    room.settle();

    expect(ada.store.getState().undo()).toBe(false);
    room.settle();
    expect(ada.store.getState().doc.nodes.a?.position).toEqual({ x: 500, y: 0 });
  });
});

describe("CollabClient: the collaboration switch", () => {
  it("returns to autosave when switched off, keeping unacknowledged changes for it", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();
    ben.client.setCursor({ x: 1, y: 2 });
    room.settle();
    expect(Object.keys(ada.client.presence.getState().roster.peers)).toHaveLength(1);

    room.setEnabled(false);
    room.deliver();
    expect(ada.store.getState()).toMatchObject({
      collaborating: false,
      collaborationEnabled: false,
      syncStatus: "standby",
      collabNotice: { kind: "off", message: "Live collaboration turned off by Ada Okafor" },
    });
    expect(ada.client.presence.getState().roster.peers).toEqual({});

    ada.store.getState().apply(move("a", 5));
    room.settle();
    expect(room.submitted).toHaveLength(0);
    expect(ada.store.getState().pending).toHaveLength(1);
  });

  it("keeps a change the server refused because collaboration was just switched off", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    room.enabled = false;
    ada.store.getState().apply(move("a", 5));
    room.process();
    room.deliver();

    expect(ada.store.getState().pending).toHaveLength(1);
    expect(ada.store.getState().collabNotice).toBeNull();
  });

  it("switches on after autosave finished, from a snapshot, and sends what is still pending", async () => {
    const { room, join } = setup({ enabled: false });
    let flushed = false;
    const ada = join(ADA, {
      beforeEnable: () => {
        flushed = true;
        return Promise.resolve();
      },
    });
    room.settle();
    expect(ada.store.getState()).toMatchObject({
      collaborating: false,
      syncStatus: "standby",
      saveStatus: { kind: "idle" },
    });
    // Saved by autosave while collaboration was off: not in the operation log.
    room.overwrite(serializeDocument(stateOf([node("a", { data: { text: "Saved" } })])));
    ada.store.getState().apply(move("a", 9));

    room.setEnabled(true, "Theo Marsh");
    room.deliver();
    expect(ada.store.getState().collabNotice).toEqual({
      kind: "on",
      message: "Live collaboration turned on by Theo Marsh",
    });
    await Promise.resolve();
    expect(flushed).toBe(true);
    room.settle();

    expect(ada.store.getState()).toMatchObject({ collaborating: true, pending: [] });
    expect(room.state.nodes.a).toMatchObject({ position: { x: 9, y: 0 }, data: { text: "Saved" } });
    expect(docOf(ada.store)).toEqual(roomDoc(room));
  });

  it("ignores an announcement that changes nothing", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    room.setEnabled(true);
    room.deliver();

    expect(ada.store.getState().collabNotice).toBeNull();
  });
});

describe("CollabClient: version announcements", () => {
  it("tells the editor when someone saved a version", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    room.announceVersion(5);
    room.deliver();

    expect(ada.store.getState().announcedVersion).toBe(5);
  });
});

describe("CollabClient: server-minted sessions", () => {
  it("takes its session id from the server and keeps it across a reconnect with the resume token", () => {
    const { room, time, join } = setup();
    const ada = join(ADA);
    expect(ada.store.getState().sessionId).toBe("");
    room.settle();
    const first = ada.sessionId;
    expect(first).toMatch(/^session-/);

    const socket = ada.socket();
    if (!socket) throw new Error("no socket");
    const perform = vi.spyOn(socket, "perform");
    room.drop(socket);
    room.deliver();
    time.advance(1000);
    room.settle();

    expect(perform).toHaveBeenCalledWith("join", { lastSeq: 0, resume: FakeRoom.resumeToken(ADA.memberId, first) });
    expect(ada.sessionId).toBe(first);
    expect(ada.client.state).toEqual({ kind: "live", gap: false });
  });

  it("never shares the resume token with peers", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();
    ada.client.setSelection("a", false);
    room.process();
    const seenByBen = room.outbox
      .filter((delivery) => delivery.socket === ben.socket())
      .map((delivery) => JSON.stringify(delivery.kind === "message" ? delivery.data : null));

    expect(seenByBen.length).toBeGreaterThan(0);
    for (const text of seenByBen) expect(text).not.toContain(FakeRoom.resumeToken(ADA.memberId, ada.sessionId));
  });

  it("a member who copies another's session id and next change ids cannot suppress or acknowledge their changes", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();
    const intruder = ben.socket();
    if (!intruder) throw new Error("no socket");
    // Ben learns Ada's session id from her presence and claims it, then sends Ada's next change id first.
    intruder.perform("join", { lastSeq: room.revision, resume: FakeRoom.resumeToken(BEN.memberId, ada.sessionId) });
    intruder.perform("submit", { clientOpId: "1", op: move("b", 99) });
    room.settle();
    ada.store.getState().apply(move("a", 10));
    room.settle();

    expect(ada.store.getState().pending).toEqual([]);
    expect(ada.store.getState().saveStatus.kind).toBe("saved");
    expect(room.document.nodes.find((entry) => entry.id === "a")?.position).toEqual({ x: 10, y: 0 });
    expect(room.log.map((entry) => [entry.memberId, entry.clientOpId])).toEqual([
      [BEN.memberId, "1"],
      [ADA.memberId, "1"],
    ]);
    expect(docOf(ada.store)).toEqual(roomDoc(room));
  });

  it("shows the server's error when it could not handle a request", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    ada.socket()?.handlers.received({ type: "error", message: "The server could not handle this request" });

    expect(ada.store.getState().collabNotice).toEqual({
      kind: "refused",
      message: "The server could not handle this request",
    });
  });
});

describe("CollabClient: presence", () => {
  it("shares cursors in canvas coordinates and the selected step, and answers newcomers", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    room.settle();
    ada.client.setCursor({ x: 120, y: 80 });
    ada.client.setSelection("b", false);
    const ben = join(BEN);
    room.settle();

    const seenByBen = Object.values(ben.client.presence.getState().roster.peers);
    expect(seenByBen).toHaveLength(1);
    expect(seenByBen[0]).toMatchObject({ name: "Ada Okafor", cursor: { x: 120, y: 80 }, nodeId: "b", editing: false });
    expect(Object.values(ada.client.presence.getState().roster.peers)[0]).toMatchObject({ name: "Ben Lindqvist" });
  });

  it("removes a peer at once when they leave", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();
    ben.client.stop();
    room.deliver();

    expect(ada.client.presence.getState().roster.peers).toEqual({});
  });

  it("re-sends presence every 10 s so idle peers do not expire, and expires silent ones", () => {
    const { room, time, join } = setup();
    const ada = join(ADA);
    const ben = join(BEN);
    room.settle();
    const presenceMessages = () => room.requests.filter((request) => request.action === "presence").length;

    time.advance(HEARTBEAT_MS);
    expect(presenceMessages()).toBe(2);
    room.settle();
    expect(Object.keys(ada.client.presence.getState().roster.peers)).toEqual([ben.sessionId]);

    ben.socket()?.dispose();
    room.outbox.splice(0, room.outbox.length);
    time.advance(31_000);
    room.settle();
    expect(ada.client.presence.getState().now).toBe(time.now() - (time.now() % 1000));
  });

  it("does not send presence before it is live, and ignores repeated selections", () => {
    const { room, join } = setup();
    const ada = join(ADA);
    ada.client.setCursor({ x: 1, y: 1 });
    ada.client.setSelection("a", true);
    expect(room.requests).toHaveLength(0);
    room.settle();
    const before = room.requests.length;
    ada.client.setSelection("a", true);

    expect(room.requests.length).toBe(before);
    expect(
      jsonEqual(ada.client.presence.getState().self, { sessionId: ada.sessionId, memberId: "1", name: "Ada Okafor" }),
    ).toBe(true);
  });
});
