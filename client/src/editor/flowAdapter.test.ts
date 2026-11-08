import { describe, expect, it } from "vitest";
import { applyOperation } from "../document/operations";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import {
  createEdgeMapper,
  createNodeMapper,
  DRAG_LIFT,
  EDGE_LAYER_Z,
  GHOST_NODE_ID,
  SELECTED_EDGE_Z,
  type NodeView,
} from "./flowAdapter";

function view(overrides: Partial<NodeView> = {}): NodeView {
  return { doc: sampleState(), selected: [], dragPositions: {}, measured: {}, canEdit: true, ...overrides };
}

describe("node mapping", () => {
  it("orders parents first and maps document fields onto canvas nodes", () => {
    const nodes = createNodeMapper()(view({ selected: ["a"], measured: { a: { width: 101, height: 51 } } }));

    expect(nodes.map((entry) => entry.id)).toEqual(["g", "c", "a", "b"]);
    expect(nodes[0]).toMatchObject({ type: "group", zIndex: -1, width: 300, height: 200, draggable: true });
    expect(nodes[2]).toMatchObject({
      parentId: "g",
      selected: true,
      position: { x: 20, y: 40 },
      measured: { width: 101, height: 51 },
    });
    expect(nodes[1]).not.toHaveProperty("parentId");
  });

  it("shows the drag position while dragging", () => {
    const nodes = createNodeMapper()(view({ dragPositions: { c: { x: 5, y: 6 } } }));

    expect(nodes.find((entry) => entry.id === "c")?.position).toEqual({ x: 5, y: 6 });
  });

  it("notes and labels cannot be connected, and nothing is draggable for viewers", () => {
    const doc = stateOf([
      node("n", { kind: "note" }),
      node("l", { kind: "label", number: 2 }),
      node("s", { number: 3 }),
    ]);
    const nodes = createNodeMapper()(view({ doc, canEdit: false }));

    expect(nodes.map((entry) => [entry.connectable, entry.draggable])).toEqual([
      [false, false],
      [false, false],
      [false, false],
    ]);
    expect(createNodeMapper()(view({ doc })).map((entry) => entry.connectable)).toEqual([false, false, true]);
  });

  it("reuses the objects of nodes that did not change", () => {
    const toNodes = createNodeMapper();
    const start = sampleState();
    const first = toNodes(view({ doc: start }));
    const moved = applyOperation(start, { type: "node.update", id: "c", fields: { position: { x: 1, y: 1 } } }).state;
    const second = toNodes(view({ doc: moved }));

    expect(second[0]).toBe(first[0]);
    expect(second[2]).toBe(first[2]);
    expect(second[1]).not.toBe(first[1]);
    expect(toNodes(view({ doc: moved, selected: ["c"] }))[1]?.selected).toBe(true);
  });
});

describe("edge mapping", () => {
  it("maps edges and reuses unchanged ones", () => {
    const toEdges = createEdgeMapper();
    const doc = sampleState();
    const first = toEdges({ doc, selected: [] });
    const second = toEdges({ doc, selected: ["bc"] });

    expect(first[0]).toMatchObject({
      id: "ab",
      type: "connector",
      source: "a",
      target: "b",
      selected: false,
      data: { endpointSelected: false, ghost: false },
    });
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(second[1]?.selected).toBe(true);
  });

  it("marks connectors whose step is selected, so their handles show", () => {
    const toEdges = createEdgeMapper();
    const doc = sampleState();
    const first = toEdges({ doc, selected: [] });
    const edges = toEdges({ doc, selected: [], selectedNodes: ["c"] });
    expect(edges.find((entry) => entry.id === "bc")?.data?.endpointSelected).toBe(true);
    expect(edges.find((entry) => entry.id === "ab")).toBe(first.find((entry) => entry.id === "ab"));
  });

  it("layers connectors above steps by default, below them in the back layer, and raises the selected one", () => {
    const doc = {
      ...sampleState(),
      edges: {
        n: edge("n", "a", "c"),
        b: edge("b", "c", "a", { style: { layer: "back" } }),
        f: edge("f", "b", "c", { style: { layer: "front" } }),
        s: edge("s", "a", "b", { style: { layer: "back" } }),
      },
    };
    const z = Object.fromEntries(createEdgeMapper()({ doc, selected: ["s"] }).map((entry) => [entry.id, entry.zIndex]));
    expect(z).toEqual({ n: EDGE_LAYER_Z.normal, b: EDGE_LAYER_Z.back, f: EDGE_LAYER_Z.front, s: SELECTED_EDGE_Z });
    expect(EDGE_LAYER_Z.back).toBeLessThan(1);
    expect(EDGE_LAYER_Z.normal).toBeLessThan(EDGE_LAYER_Z.front);
    expect(EDGE_LAYER_Z.front).toBeLessThan(SELECTED_EDGE_Z);
    expect(SELECTED_EDGE_Z).toBeLessThan(DRAG_LIFT);
  });

  it("adds a ghost step and ghost connectors from every source while a drop waits for a shape", () => {
    const doc = sampleState();
    const pendingDrop = {
      position: { x: 500, y: 400 },
      screen: { x: 0, y: 0 },
      sources: ["a", "c"],
      side: "right" as const,
      sketch: [{ x: 300, y: 300 }],
    };
    const nodes = createNodeMapper()(view({ doc, pendingDrop }));
    const ghost = nodes.find((entry) => entry.id === GHOST_NODE_ID);
    expect(ghost).toMatchObject({ type: "ghost", selectable: false, draggable: false, position: { x: 410, y: 368 } });
    const edges = createEdgeMapper()({
      doc,
      selected: [],
      pendingDrop,
      defaults: { kind: "connector", style: "polyline" },
    });
    const ghosts = edges.filter((entry) => entry.data?.ghost);
    expect(ghosts.map((entry) => [entry.source, entry.target, entry.sourceHandle])).toEqual([
      ["a", GHOST_NODE_ID, "right"],
      ["c", GHOST_NODE_ID, "right"],
    ]);
    expect(ghosts[0]?.data?.edge.route).toEqual({
      style: "polyline",
      points: [{ id: "ghost-point-0", x: 300, y: 300 }],
    });
    expect(ghosts[1]?.data?.edge.route.points).toEqual([]);
    const stepGhosts = createEdgeMapper()({ doc, selected: [], pendingDrop: { ...pendingDrop, side: null } });
    expect(
      stepGhosts
        .filter((entry) => entry.data?.ghost)
        .map((entry) => [entry.sourceHandle, entry.data?.edge.route.points.length]),
    ).toEqual([
      ["bottom", 0],
      ["bottom", 0],
    ]);
  });
});

describe("stacking, confinement and live fields", () => {
  it("draws groups below edges and other nodes by their stack order, lifting a dragged node", () => {
    const toNodes = createNodeMapper();
    const nodes = toNodes(view({ dragPositions: { b: { x: 1, y: 1 } } }));
    const byId = Object.fromEntries(nodes.map((entry) => [entry.id, entry]));
    expect(byId.g?.zIndex).toBe(-1);
    expect(byId.a?.zIndex).toBe(2);
    expect(byId.b?.zIndex).toBe(3 + DRAG_LIFT);
  });

  it("confines children to their group unless Alt detach mode is on", () => {
    expect(createNodeMapper()(view()).find((entry) => entry.id === "a")?.extent).toBe("parent");
    expect(createNodeMapper()(view({ detachMode: true })).find((entry) => entry.id === "a")?.extent).toBeUndefined();
    expect(createNodeMapper()(view()).find((entry) => entry.id === "c")?.extent).toBeUndefined();
  });

  it("merges live fields into the node and makes the edited node undraggable", () => {
    const toNodes = createNodeMapper();
    const live = { c: { size: { width: 300, height: 90 }, data: { text: "live" } } };
    const doc = sampleState();
    const nodes = toNodes(view({ doc, live, editingNodeId: "c" }));
    const c = nodes.find((entry) => entry.id === "c");
    expect(c).toMatchObject({ width: 300, height: 90, draggable: false });
    expect(c?.data.node.data).toEqual({ text: "live" });
    expect(c?.data.node.size).toEqual({ width: 300, height: 90 });
    const again = toNodes(view({ doc, live, editingNodeId: "c" }));
    expect(again.find((entry) => entry.id === "c")).toBe(c);
  });

  it("a live position without data keeps the stored data object", () => {
    const doc = sampleState();
    const nodes = createNodeMapper()(view({ doc, live: { c: { position: { x: 5, y: 6 } } } }));
    const c = nodes.find((entry) => entry.id === "c");
    expect(c?.position).toEqual({ x: 5, y: 6 });
    expect(c?.data.node.data).toBe(doc.nodes.c?.data);
  });

  it("gives edges their stored sides, or bottom-to-top when automatic", () => {
    const doc = {
      ...sampleState(),
      edges: {
        e: { ...edge("e", "a", "c"), sourceSide: "right" as const, targetSide: "left" as const },
        f: edge("f", "c", "a"),
      },
    };
    const edges = createEdgeMapper()({ doc, selected: [] });
    expect(edges.map((entry) => [entry.sourceHandle, entry.targetHandle])).toEqual([
      ["right", "left"],
      ["bottom", "top"],
    ]);
  });
});
