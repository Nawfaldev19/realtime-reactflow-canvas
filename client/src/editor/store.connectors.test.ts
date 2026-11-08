import { describe, expect, it } from "vitest";
import { serializeDocument } from "../document/serialize";
import type { DocumentState } from "../document/types";
import { isOrthogonal } from "../routing/orthogonal";
import { edge, node, stateOf } from "../test/fixtures";
import { createEditorStore } from "./store";

/** Steps a, b, c in a row 300 apart, a sticky note n, and the connector a → b. */
function diagram(): DocumentState {
  return stateOf(
    [
      node("a", { number: 1, position: { x: 0, y: 0 }, size: { width: 100, height: 60 } }),
      node("b", { number: 2, position: { x: 300, y: 0 }, size: { width: 100, height: 60 } }),
      node("c", { number: 3, position: { x: 600, y: 0 }, size: { width: 100, height: 60 } }),
      node("d", { number: 4, position: { x: 300, y: 300 }, size: { width: 100, height: 60 } }),
      node("n", { kind: "note", number: 5, position: { x: 0, y: 300 } }),
    ],
    [edge("ab", "a", "b", { label: { text: "Yes", t: 0.3 }, style: { pattern: "dashed" } })],
  );
}

function storeWith(doc = diagram(), canEdit = true) {
  const store = createEditorStore();
  store.getState().load({ id: "d1", title: "Plan", revision: 1, document: serializeDocument(doc), canEdit });
  return store;
}

const edgeCount = (store: ReturnType<typeof storeWith>) => Object.keys(store.getState().doc.edges).length;
const nodeCount = (store: ReturnType<typeof storeWith>) => Object.keys(store.getState().doc.nodes).length;

describe("connection sessions", () => {
  it("connects from every selected connectable step when the dragged one is part of the selection", () => {
    const store = storeWith();
    store.getState().setSelection(["a", "c", "n"], []);
    store.getState().startConnection("c", "bottom");
    expect(store.getState().connection).toEqual({ sources: ["c", "a"], side: "bottom", sketching: false, sketch: [] });
    store.getState().startConnection("b", null);
    expect(store.getState().connection?.sources).toEqual(["b"]);
    store.getState().endConnection();
    expect(store.getState().connection).toBeNull();
    store.getState().endConnection();
  });

  it("does not start in view mode or from a missing step", () => {
    const store = storeWith(diagram(), false);
    store.getState().startConnection("a", null);
    expect(store.getState().connection).toBeNull();
    const editable = storeWith();
    editable.getState().startConnection("ghost", null);
    expect(editable.getState().connection).toBeNull();
  });

  it("records sketch points only while Space is held, spaced by the default style", () => {
    const store = storeWith();
    store.getState().setConnectorDefaults({ style: "polyline" });
    store.getState().startConnection("a", "right");
    store.getState().recordSketch({ x: 200, y: 30 }, { x: 100, y: 30 });
    expect(store.getState().connection?.sketch).toEqual([]);
    store.getState().setSketching(true);
    store.getState().setSketching(true);
    store.getState().recordSketch({ x: 120, y: 30 }, { x: 100, y: 30 });
    expect(store.getState().connection?.sketch).toEqual([]);
    store.getState().recordSketch({ x: 130, y: 60 }, { x: 100, y: 30 });
    expect(store.getState().connection?.sketch).toEqual([{ x: 130, y: 60 }]);
    store.getState().setSketching(false);
    store.getState().recordSketch({ x: 300, y: 300 }, { x: 100, y: 30 });
    expect(store.getState().connection?.sketch).toHaveLength(1);
  });

  it("snaps sketch points to right angles for the step style", () => {
    const store = storeWith();
    store.getState().startConnection("a", "right");
    store.getState().setSketching(true);
    store.getState().recordSketch({ x: 140, y: 34 }, { x: 100, y: 30 });
    expect(store.getState().connection?.sketch).toEqual([{ x: 140, y: 30 }]);
  });
});

describe("connectMany", () => {
  it("creates one connector per source as one operation and selects them", () => {
    const store = storeWith();
    const pending = store.getState().pending.length;
    const created = store.getState().connectMany(["a", "b", "c"], "d", "bottom", null);
    expect(created).toHaveLength(3);
    expect(store.getState().pending).toHaveLength(pending + 1);
    expect(store.getState().selectedEdgeIds).toEqual(created);
    expect(store.getState().selectedNodeIds).toEqual([]);
    for (const id of created)
      expect(store.getState().doc.edges[id]).toMatchObject({
        target: "d",
        sourceSide: "bottom",
        targetSide: null,
        kind: "connector",
        route: { style: "step" },
      });
  });

  it("skips the target itself and existing pairs, and creates nothing when every pair is refused", () => {
    const store = storeWith();
    expect(store.getState().connectMany(["a", "b"], "b", null, null)).toEqual([]);
    expect(edgeCount(store)).toBe(1);
    expect(store.getState().connectMany(["a", "c", "b"], "b", null, null)).toHaveLength(1);
    expect(store.getState().connect("a", "b")).toBe(false);
  });

  it("uses the page defaults and turns a sketch into the first connector's points", () => {
    const store = storeWith();
    store.getState().setConnectorDefaults({ style: "spline" });
    const [first, second] = store.getState().connectMany(["a", "c"], "d", null, null, [
      { x: 150, y: 200 },
      { x: 250, y: 250 },
    ]);
    expect(store.getState().doc.edges[first ?? ""]?.route).toMatchObject({
      style: "spline",
      points: [
        { x: 150, y: 200, userCreated: true },
        { x: 250, y: 250, userCreated: true },
      ],
    });
    expect(store.getState().doc.edges[second ?? ""]?.route.points).toEqual([]);
  });

  it("stores a sketched step route as an orthogonal vertex list between the stubs", () => {
    const store = storeWith();
    const [id] = store.getState().connectMany(["a"], "d", "right", "top", [
      { x: 200, y: 30 },
      { x: 200, y: 200 },
      { x: 350, y: 200 },
    ]);
    const points = store.getState().doc.edges[id ?? ""]?.route.points ?? [];
    expect(points[0]).toMatchObject({ x: 120, y: 30 });
    expect(points.at(-1)).toMatchObject({ x: 350, y: 280 });
    expect(isOrthogonal([{ x: 100, y: 30 }, ...points, { x: 350, y: 300 }])).toBe(true);
  });

  it("creates floating connectors without points", () => {
    const store = storeWith();
    store.getState().setConnectorDefaults({ kind: "floating" });
    const [id] = store.getState().connectMany(["a"], "c", null, null, [{ x: 1, y: 1 }]);
    expect(store.getState().doc.edges[id ?? ""]).toMatchObject({ kind: "floating", route: { points: [] } });
  });

  it("keeps the connector defaults when another diagram loads", () => {
    const store = storeWith();
    store.getState().setConnectorDefaults({ style: "bezier" });
    store
      .getState()
      .load({ id: "d2", title: "Other", revision: 1, document: serializeDocument(diagram()), canEdit: true });
    expect(store.getState().connectorDefaults.style).toBe("bezier");
  });
});

describe("drop on empty canvas", () => {
  it("leaves the document untouched when the menu is dismissed", () => {
    const store = storeWith();
    store.getState().startConnection("a", "bottom");
    store.getState().openDrop({ x: 50, y: 400 }, { x: 10, y: 20 });
    expect(store.getState().connection).toBeNull();
    expect(store.getState().pendingDrop).toMatchObject({ position: { x: 50, y: 400 }, sources: ["a"], side: "bottom" });
    store.getState().cancelDrop();
    store.getState().cancelDrop();
    expect(store.getState().pendingDrop).toBeNull();
    expect([nodeCount(store), edgeCount(store)]).toEqual([5, 1]);
    expect(store.getState().pending).toHaveLength(0);
    expect(store.getState().completeDrop("step")).toBeNull();
  });

  it("creates one step and a connector from every source as a single operation", () => {
    const store = storeWith();
    store.getState().setSelection(["a", "c"], []);
    store.getState().startConnection("a", "bottom");
    store.getState().openDrop({ x: 350, y: 600 }, { x: 0, y: 0 });
    const id = store.getState().completeDrop("shape", { shape: "circle" });
    const created = store.getState().doc.nodes[id ?? ""];
    expect(created).toMatchObject({ kind: "shape", data: { shape: "circle" }, position: { x: 280, y: 540 } });
    expect([nodeCount(store), edgeCount(store)]).toEqual([6, 3]);
    expect(
      Object.values(store.getState().doc.edges)
        .filter((entry) => entry.target === id)
        .map((entry) => entry.source)
        .sort(),
    ).toEqual(["a", "c"]);
    // One operation: a single undo removes the step and both connectors.
    expect(store.getState().pending).toHaveLength(1);
    expect(store.getState().pending[0]?.op).toMatchObject({
      type: "batch",
      ops: [{ type: "node.add" }, { type: "edge.add" }, { type: "edge.add" }],
    });
    expect(store.getState().selectedNodeIds).toEqual([id]);
    expect(store.getState().pendingDrop).toBeNull();
  });

  it("keeps the sketched points on the first new connector", () => {
    const store = storeWith();
    store.getState().setConnectorDefaults({ style: "polyline" });
    store.getState().startConnection("a", "right");
    store.getState().setSketching(true);
    store.getState().recordSketch({ x: 200, y: 30 }, { x: 100, y: 30 });
    store.getState().openDrop({ x: 200, y: 500 }, { x: 0, y: 0 });
    const id = store.getState().completeDrop("decision");
    const connector = Object.values(store.getState().doc.edges).find((entry) => entry.target === id);
    expect(connector?.route.points).toEqual([expect.objectContaining({ x: 200, y: 30 })]);
  });

  it("does not open in view mode or without a connection", () => {
    const store = storeWith();
    store.getState().openDrop({ x: 0, y: 0 }, { x: 0, y: 0 });
    expect(store.getState().pendingDrop).toBeNull();
  });
});

describe("editing connectors", () => {
  it("commits route points as one operation, capped at 200", () => {
    const store = storeWith();
    const points = Array.from({ length: 250 }, (_, index) => ({ id: `p${String(index)}`, x: index, y: 0 }));
    expect(store.getState().commitRoute("ab", points)).toBe(true);
    expect(store.getState().doc.edges.ab?.route.points).toHaveLength(200);
    expect(store.getState().commitRoute("missing", points)).toBe(false);
  });

  it("applies a change to several connectors as one operation", () => {
    const store = storeWith();
    store.getState().connectMany(["c", "d"], "a", null, null);
    const ids = Object.keys(store.getState().doc.edges);
    const pending = store.getState().pending.length;
    expect(store.getState().updateEdges(ids, () => ({ style: { width: 4 } }))).toBe(true);
    expect(store.getState().pending).toHaveLength(pending + 1);
    expect(Object.values(store.getState().doc.edges).every((entry) => entry.style.width === 4)).toBe(true);
    expect(store.getState().updateEdges(["missing"], () => ({ style: {} }))).toBe(false);
    expect(store.getState().updateEdges(ids, () => null)).toBe(false);
  });

  it("switches route styles, clearing points, and can undo the switch from the notice", () => {
    const store = storeWith();
    store.getState().commitRoute("ab", [{ id: "p", x: 150, y: 100, userCreated: true }]);
    expect(store.getState().setRouteStyle(["ab"], "spline")).toBe(true);
    expect(store.getState().doc.edges.ab?.route).toEqual({ style: "spline", points: [] });
    expect(store.getState().routeNotice?.previous.ab?.points).toHaveLength(1);
    store.getState().undoRouteStyle();
    expect(store.getState().doc.edges.ab?.route).toEqual({
      style: "step",
      points: [{ id: "p", x: 150, y: 100, userCreated: true }],
    });
    expect(store.getState().routeNotice).toBeNull();
    store.getState().undoRouteStyle();
  });

  it("shows no notice when nothing was cleared, and dismisses it on request", () => {
    const store = storeWith();
    expect(store.getState().setRouteStyle(["ab"], "polyline")).toBe(true);
    expect(store.getState().routeNotice).toBeNull();
    expect(store.getState().setRouteStyle(["ab"], "polyline")).toBe(false);
    store.getState().commitRoute("ab", [{ id: "p", x: 1, y: 1 }]);
    store.getState().setRouteStyle(["ab"], "step");
    store.getState().dismissRouteNotice();
    store.getState().dismissRouteNotice();
    expect(store.getState().routeNotice).toBeNull();
  });

  it("reconnects one end, keeping the id, label and style; orthogonal routes restart, free ones keep their points", () => {
    const store = storeWith();
    store.getState().commitRoute("ab", [{ id: "p", x: 150, y: 100 }]);
    expect(store.getState().reconnect("ab", "target", "c", "left")).toBe(true);
    expect(store.getState().doc.edges.ab).toMatchObject({
      id: "ab",
      source: "a",
      target: "c",
      targetSide: "left",
      label: { text: "Yes", t: 0.3 },
      style: { pattern: "dashed" },
      route: { points: [] },
    });
    store.getState().setRouteStyle(["ab"], "polyline");
    store.getState().commitRoute("ab", [{ id: "p", x: 150, y: 100 }]);
    expect(store.getState().reconnect("ab", "source", "d", null)).toBe(true);
    expect(store.getState().doc.edges.ab).toMatchObject({
      source: "d",
      sourceSide: null,
      route: { style: "polyline", points: [{ id: "p" }] },
    });
  });

  it("refuses reconnects onto the other end, unconnectable steps, duplicates and missing connectors", () => {
    const store = storeWith();
    store.getState().connectMany(["a"], "c", null, null);
    expect(store.getState().reconnect("ab", "target", "a", null)).toBe(false);
    expect(store.getState().reconnect("ab", "target", "n", null)).toBe(false);
    expect(store.getState().reconnect("ab", "target", "c", null)).toBe(false);
    expect(store.getState().reconnect("missing", "target", "c", null)).toBe(false);
  });

  it("opens and closes label editing, selecting the connector, and closes it when the connector is deleted", () => {
    const store = storeWith();
    store.getState().setSelection(["a"], []);
    store.getState().startLabelEdit("ab", "quick");
    expect(store.getState().labelEditing).toEqual({ edgeId: "ab", mode: "quick" });
    expect(store.getState().selectedEdgeIds).toEqual(["ab"]);
    expect(store.getState().selectedNodeIds).toEqual([]);
    store.getState().deleteElements([], ["ab"]);
    expect(store.getState().labelEditing).toBeNull();
    store.getState().startLabelEdit("ab", "inline");
    expect(store.getState().labelEditing).toBeNull();
    store.getState().stopLabelEdit();
  });

  it("keeps label editing open when something else is deleted", () => {
    const store = storeWith();
    store.getState().startLabelEdit("ab", "inline");
    store.getState().deleteElements(["c"], []);
    expect(store.getState().labelEditing).toEqual({ edgeId: "ab", mode: "inline" });
    store.getState().stopLabelEdit();
    expect(store.getState().labelEditing).toBeNull();
  });
});
