import { describe, expect, it } from "vitest";
import { serializeDocument } from "../document/serialize";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import { connectionOutcome, handleEdgeChanges, handleNodeChanges, sideOf } from "./canvasChanges";
import type { NodeHit } from "../routing/connect";
import { Snapper } from "./snapping";
import { createEditorStore } from "./store";

function storeFor(canEdit = true) {
  const store = createEditorStore();
  store.getState().load({ id: "d", title: "Plan", revision: 1, document: serializeDocument(sampleState()), canEdit });
  return store;
}

describe("node changes", () => {
  it("drag frames update ephemeral positions; the release commits them", () => {
    const store = storeFor();
    handleNodeChanges([{ type: "position", id: "c", position: { x: 610, y: 105 }, dragging: true }], store);

    expect(store.getState().dragPositions).toEqual({ c: { x: 610, y: 105 } });
    expect(store.getState().pending).toHaveLength(0);

    handleNodeChanges([{ type: "position", id: "c", dragging: false }], store);
    expect(store.getState().doc.nodes.c?.position).toEqual({ x: 610, y: 105 });
    expect(store.getState().pending).toHaveLength(1);
  });

  it("a keyboard move (no drag) commits at once", () => {
    const store = storeFor();
    handleNodeChanges([{ type: "position", id: "c", position: { x: 605, y: 100 } }], store);

    expect(store.getState().doc.nodes.c?.position).toEqual({ x: 605, y: 100 });
  });

  it("viewers cannot move nodes", () => {
    const store = storeFor(false);
    handleNodeChanges([{ type: "position", id: "c", position: { x: 1, y: 1 }, dragging: false }], store);

    expect(store.getState().doc.nodes.c?.position).toEqual({ x: 600, y: 100 });
    expect(store.getState().dragPositions).toEqual({});
  });

  it("records measured sizes and selection without creating operations", () => {
    const store = storeFor();
    handleNodeChanges(
      [
        { type: "dimensions", id: "c", dimensions: { width: 100, height: 52 } },
        { type: "dimensions", id: "b" },
        { type: "select", id: "a", selected: true },
        { type: "select", id: "c", selected: true },
        { type: "select", id: "c", selected: false },
      ],
      store,
    );

    expect(store.getState().measured).toEqual({ c: { width: 100, height: 52 } });
    expect(store.getState().selectedNodeIds).toEqual(["a"]);
    expect(store.getState().pending).toHaveLength(0);
  });

  it("removals delete the nodes with their edges", () => {
    const store = storeFor();
    handleNodeChanges(
      [
        { type: "remove", id: "c" },
        { type: "replace", id: "a", item: { id: "a", position: { x: 0, y: 0 }, data: { node: node("a") } } },
      ],
      store,
    );

    expect(store.getState().doc.nodes.c).toBeUndefined();
    expect(store.getState().doc.edges.bc).toBeUndefined();
  });
});

describe("edge changes", () => {
  it("selects and deletes edges", () => {
    const store = storeFor();
    handleEdgeChanges(
      [
        { type: "select", id: "ab", selected: true },
        { type: "select", id: "bc", selected: true },
        { type: "select", id: "bc", selected: false },
      ],
      store,
    );
    expect(store.getState().selectedEdgeIds).toEqual(["ab"]);

    handleEdgeChanges([{ type: "remove", id: "ab" }], store);
    expect(store.getState().doc.edges.ab).toBeUndefined();
    expect(store.getState().selectedEdgeIds).toEqual([]);
  });

  it("ignores other change kinds", () => {
    const store = storeFor();
    const before = store.getState();
    handleEdgeChanges(
      [
        {
          type: "add",
          item: {
            id: "x",
            source: "a",
            target: "c",
            data: { edge: edge("x", "a", "c"), endpointSelected: false, ghost: false },
          },
        },
      ],
      store,
    );

    expect(store.getState()).toBe(before);
  });
});

describe("resize changes", () => {
  it("resize frames become live fields and the end becomes one operation", () => {
    const store = storeFor();
    handleNodeChanges(
      [
        { type: "position", id: "c", position: { x: 590, y: 100 } },
        { type: "dimensions", id: "c", dimensions: { width: 110, height: 50 }, resizing: true, setAttributes: true },
      ],
      store,
    );
    expect(store.getState().live.c).toEqual({ position: { x: 590, y: 100 }, size: { width: 110, height: 50 } });
    expect(store.getState().doc.nodes.c?.position).toEqual({ x: 600, y: 100 });
    expect(store.getState().pending).toHaveLength(0);

    handleNodeChanges(
      [{ type: "dimensions", id: "c", dimensions: { width: 120, height: 60 }, resizing: false }],
      store,
    );
    expect(store.getState().doc.nodes.c).toMatchObject({
      position: { x: 590, y: 100 },
      size: { width: 120, height: 60 },
    });
    expect(store.getState().live).toEqual({});
    expect(store.getState().pending).toHaveLength(1);
  });
});

describe("connection outcomes", () => {
  const hits: NodeHit[] = [
    { id: "a", box: { x: 0, y: 0, width: 100, height: 60 }, rank: 1, connectable: true },
    { id: "b", box: { x: 300, y: 0, width: 100, height: 60 }, rank: 2, connectable: true },
  ];
  const base = { isValid: null, toNode: null, toHandle: null, hits, from: "a" } as const;

  it("connects to the handle the library found valid, with its side", () => {
    expect(
      connectionOutcome({ ...base, isValid: true, toNode: "b", toHandle: "left", point: { x: 300, y: 30 } }),
    ).toEqual({ kind: "connect", target: "b", targetSide: "left" });
    expect(
      connectionOutcome({ ...base, isValid: true, toNode: "b", toHandle: "middle", point: { x: 300, y: 30 } }),
    ).toEqual({ kind: "connect", target: "b", targetSide: null });
  });

  it("connects anywhere in a step's drop zone with automatic sides", () => {
    expect(connectionOutcome({ ...base, point: { x: 350, y: 30 } })).toEqual({
      kind: "connect",
      target: "b",
      targetSide: null,
    });
  });

  it("opens the drop menu over empty canvas and does nothing over a step's edge or the source", () => {
    expect(connectionOutcome({ ...base, point: { x: 200, y: 300 } })).toEqual({ kind: "drop" });
    expect(connectionOutcome({ ...base, point: { x: 302, y: 2 } })).toEqual({ kind: "none" });
    expect(connectionOutcome({ ...base, point: { x: 50, y: 30 } })).toEqual({ kind: "none" });
    expect(connectionOutcome({ ...base, isValid: true, toNode: "a", toHandle: "top", point: { x: 50, y: 0 } })).toEqual(
      { kind: "none" },
    );
  });

  it("reads handle ids as sides", () => {
    expect(sideOf("left")).toBe("left");
    expect(sideOf(null)).toBeNull();
    expect(sideOf("middle")).toBeNull();
  });
});

describe("snapping drag and resize frames", () => {
  const view = () => ({ viewport: { x: 0, y: 0, zoom: 1 }, width: 2000, height: 2000 });

  function snapStore() {
    const store = createEditorStore();
    const doc = stateOf([
      node("a", { position: { x: 0, y: 0 }, size: { width: 100, height: 50 } }),
      node("b", { number: 2, position: { x: 300, y: 300 }, size: { width: 80, height: 40 } }),
      node("k", {
        number: 3,
        position: { x: 600, y: 600 },
        size: { width: 80, height: 40 },
        style: { keepAspectRatio: true },
      }),
    ]);
    store.getState().load({ id: "d", title: "Plan", revision: 1, document: serializeDocument(doc), canEdit: true });
    return { store, snap: { snapper: new Snapper(), view } };
  }

  it("rewrites drag frames onto guides, shows the guide, and clears it on release", () => {
    const { store, snap } = snapStore();
    handleNodeChanges([{ type: "position", id: "b", position: { x: 3, y: 300 }, dragging: true }], store, snap);
    expect(store.getState().dragPositions.b).toEqual({ x: 0, y: 300 });
    expect(store.getState().guides.vertical).toMatchObject({ ownerId: "a", anchor: "left" });
    handleNodeChanges([{ type: "position", id: "b", position: { x: 3, y: 300 }, dragging: false }], store, snap);
    expect(store.getState().doc.nodes.b?.position).toEqual({ x: 0, y: 300 });
    expect(store.getState().guides).toEqual({ horizontal: null, vertical: null });
    expect(snap.snapper.active).toBe(false);
  });

  it("does not snap keyboard moves", () => {
    const { store, snap } = snapStore();
    handleNodeChanges([{ type: "position", id: "b", position: { x: 3, y: 300 } }], store, snap);
    expect(store.getState().doc.nodes.b?.position).toEqual({ x: 3, y: 300 });
  });

  it("snaps resize frames and ends the session on the last one", () => {
    const { store, snap } = snapStore();
    handleNodeChanges(
      [{ type: "dimensions", id: "a", dimensions: { width: 100, height: 336 }, resizing: true }],
      store,
      snap,
    );
    expect(store.getState().live.a?.size).toEqual({ width: 100, height: 340 });
    expect(store.getState().guides.horizontal).toMatchObject({ ownerId: "b", anchor: "bottom" });
    handleNodeChanges(
      [{ type: "dimensions", id: "a", dimensions: { width: 100, height: 336 }, resizing: false }],
      store,
      snap,
    );
    expect(store.getState().doc.nodes.a?.size).toEqual({ width: 100, height: 340 });
    expect(store.getState().guides.horizontal).toBeNull();
  });

  it("shifts children kept in place by a snapped top-left resize, and leaves ratio-locked nodes alone", () => {
    const { store, snap } = snapStore();
    handleNodeChanges(
      [
        { type: "position", id: "b", position: { x: 297, y: 300 } },
        { type: "dimensions", id: "b", dimensions: { width: 83, height: 40 }, resizing: true },
        { type: "position", id: "a", position: { x: 3, y: 0 } },
      ],
      store,
      snap,
    );
    // 297 is not near any guide here, so nothing shifts.
    expect(store.getState().live.b).toEqual({ position: { x: 297, y: 300 }, size: { width: 83, height: 40 } });
    handleNodeChanges(
      [
        { type: "position", id: "b", position: { x: 103, y: 300 } },
        { type: "dimensions", id: "b", dimensions: { width: 277, height: 40 }, resizing: true },
        { type: "position", id: "a", position: { x: 3, y: 0 } },
      ],
      store,
      snap,
    );
    expect(store.getState().live.b).toEqual({ position: { x: 100, y: 300 }, size: { width: 280, height: 40 } });
    expect(store.getState().live.a?.position).toEqual({ x: 6, y: 0 });
    handleNodeChanges(
      [{ type: "dimensions", id: "k", dimensions: { width: 104, height: 52 }, resizing: true }],
      store,
      snap,
    );
    expect(store.getState().live.k?.size).toEqual({ width: 104, height: 52 });
  });
});
