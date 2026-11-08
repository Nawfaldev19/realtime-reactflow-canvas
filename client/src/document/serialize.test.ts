import { describe, expect, it } from "vitest";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import { orderedNodes, parseDocument, serializeDocument } from "./serialize";

describe("parseDocument", () => {
  it("round-trips a serialized document exactly", () => {
    const state = sampleState();
    const { state: parsed, report } = parseDocument(JSON.parse(JSON.stringify(serializeDocument(state))));

    expect(parsed).toEqual(state);
    expect(report).toEqual({ droppedNodes: 0, droppedEdges: 0, reparented: [], detached: [] });
  });

  it("treats anything that is not a document as empty", () => {
    expect(parseDocument(null).state).toEqual({ nodes: {}, edges: {}, nextNumber: 1 });
    expect(parseDocument({ nodes: "x", edges: 3 }).state.nodes).toEqual({});
  });

  it("fills defaults for missing or invalid optional fields", () => {
    const { state } = parseDocument({
      nodes: [
        {
          id: "a",
          kind: "blob",
          size: { width: -1, height: 2 },
          position: { x: "1" },
          style: { fill: "#fff", bad: {} },
        },
      ],
    });

    expect(state.nodes.a).toEqual({
      id: "a",
      key: "a",
      kind: "step",
      number: 1,
      position: { x: 0, y: 0 },
      size: { width: 180, height: 64 },
      parentId: null,
      z: 1,
      style: { fill: "#fff" },
      data: {},
    });
    expect(state.nextNumber).toBe(2);
  });

  it("drops entries without ids and duplicate ids, keeping the first", () => {
    const { state, report } = parseDocument({
      nodes: [{ kind: "step" }, "x", { id: "a", number: 4 }, { id: "a", number: 9 }],
    });

    expect(Object.keys(state.nodes)).toEqual(["a"]);
    expect(state.nodes.a?.number).toBe(4);
    expect(report.droppedNodes).toBe(3);
  });

  it("keeps the stored counter unless a node number is already past it", () => {
    expect(parseDocument({ nodes: [{ id: "a", number: 3 }], nextNumber: 10 }).state.nextNumber).toBe(10);
    expect(parseDocument({ nodes: [{ id: "a", number: 30 }], nextNumber: 10 }).state.nextNumber).toBe(31);
  });

  it("re-attaches children whose parent id is stale but whose parent key matches", () => {
    const { state, report } = parseDocument({
      nodes: [
        { id: "new-group", key: "old-group", kind: "group" },
        { id: "child", parentId: "old-group", position: { x: 5, y: 5 } },
      ],
    });

    expect(state.nodes.child?.parentId).toBe("new-group");
    expect(report.reparented).toEqual(["child"]);
  });

  it("detaches unresolvable children to the top level at their absolute position, never guessing", () => {
    const { state, report } = parseDocument({
      nodes: [
        { id: "only-group", kind: "group", position: { x: 100, y: 100 } },
        { id: "inner", parentId: "only-group", kind: "group", position: { x: 10, y: 10 } },
        { id: "lost", parentId: "missing", position: { x: 5, y: 6 } },
        { id: "under-step", parentId: "plain" },
        { id: "plain", position: { x: 40, y: 50 } },
        { id: "deep", parentId: "inner", position: { x: 1, y: 1 } },
      ],
    });

    expect(state.nodes.lost).toMatchObject({ parentId: null, position: { x: 5, y: 6 } });
    expect(state.nodes["under-step"]).toMatchObject({ parentId: null, position: { x: 40, y: 50 } });
    expect(state.nodes.deep?.parentId).toBe("inner");
    expect(report.detached).toEqual(["lost", "under-step"]);
  });

  it("breaks parent cycles", () => {
    const { state, report } = parseDocument({
      nodes: [
        { id: "a", kind: "group", parentId: "b", position: { x: 1, y: 1 } },
        { id: "b", kind: "group", parentId: "a", position: { x: 2, y: 2 } },
      ],
    });

    expect(report.detached).toEqual(["a"]);
    expect(state.nodes.a?.parentId).toBeNull();
    expect(state.nodes.b?.parentId).toBe("a");
  });

  it("repairs edge endpoints through keys and drops edges that cannot attach", () => {
    const { state, report } = parseDocument({
      nodes: [{ id: "a" }, { id: "b2", key: "b" }],
      edges: [
        {
          id: "e1",
          source: "a",
          target: "b",
          label: { text: "Yes", t: 4 },
          route: { style: "polyline", points: [{ id: "p", x: 1, y: 2, userCreated: true, axis: "x" }, { x: 3 }] },
        },
        { id: "e2", source: "a", target: "nowhere" },
        { id: "e1", source: "a", target: "a" },
        { source: "a", target: "a" },
        "junk",
      ],
    });

    expect(state.edges.e1).toMatchObject({
      target: "b2",
      label: { text: "Yes", t: 1 },
      route: { style: "polyline", points: [{ id: "p", x: 1, y: 2, userCreated: true, axis: "x" }] },
    });
    expect(report.droppedEdges).toBe(4);
  });

  it("normalizes edge fields", () => {
    const { state } = parseDocument({
      nodes: [{ id: "a" }],
      edges: [
        {
          id: "e",
          source: "a",
          target: "a",
          kind: "laser",
          sourceSide: "left",
          targetSide: "middle",
          label: { text: 3 },
          route: null,
        },
      ],
    });

    expect(state.edges.e).toMatchObject({
      kind: "connector",
      sourceSide: "left",
      targetSide: null,
      label: null,
      route: { style: "step", points: [] },
    });
    expect(
      parseDocument({ nodes: [{ id: "a" }], edges: [{ id: "e", source: "a", target: "a", label: { text: "x" } }] })
        .state.edges.e?.label,
    ).toEqual({ text: "x" });
  });

  it("keeps known label formatting keys with valid types and drops the rest", () => {
    const raw = {
      text: "Yes",
      t: 0.25,
      fontSize: 16,
      bold: true,
      italic: "yes",
      underline: false,
      align: "right",
      color: "#123456",
      background: 5,
      maxWidth: 300,
      padding: 4,
      border: true,
      borderWidth: 2,
      borderColor: "#abcdef",
      extra: "dropped",
    };
    const parsed = parseDocument({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "e", source: "a", target: "b", label: raw }],
    }).state.edges.e?.label;
    expect(parsed).toEqual({
      text: "Yes",
      t: 0.25,
      fontSize: 16,
      bold: true,
      underline: false,
      align: "right",
      color: "#123456",
      maxWidth: 300,
      padding: 4,
      border: true,
      borderWidth: 2,
      borderColor: "#abcdef",
    });
    expect(
      parseDocument({
        nodes: [{ id: "a" }],
        edges: [{ id: "e", source: "a", target: "a", label: { text: "x", align: "justify" } }],
      }).state.edges.e?.label,
    ).toEqual({ text: "x" });
  });
});

describe("orderedNodes", () => {
  it("puts every parent before its children, at any depth, ordered by z within a level", () => {
    const state = stateOf([
      node("leaf", { parentId: "inner", z: 1 }),
      node("inner", { kind: "group", parentId: "outer", z: 5 }),
      node("top-high", { z: 9 }),
      node("outer", { kind: "group", z: 2 }),
      node("top-low", { z: 1 }),
    ]);

    expect(orderedNodes(state).map((entry) => entry.id)).toEqual(["top-low", "outer", "top-high", "inner", "leaf"]);
  });

  it("breaks z ties by number, then id", () => {
    const state = stateOf([node("b", { number: 1 }), node("a", { number: 1 }), node("c", { number: 0 })]);

    expect(orderedNodes(state).map((entry) => entry.id)).toEqual(["c", "a", "b"]);
  });

  it("treats a node whose parent is missing as top level", () => {
    expect(orderedNodes(stateOf([node("orphan", { parentId: "gone" })])).map((entry) => entry.id)).toEqual(["orphan"]);
  });
});

describe("serializeDocument", () => {
  it("writes the version-1 wire format", () => {
    const document = serializeDocument(stateOf([node("a")], [edge("e", "a", "a")], 5));

    expect(document.schemaVersion).toBe(1);
    expect(document.nextNumber).toBe(5);
    expect(document.edges.map((entry) => entry.id)).toEqual(["e"]);
  });
});

describe("the layout field", () => {
  const layout = {
    engine: "layered",
    direction: "LR",
    manual: {
      nodes: { a: { x: 1, y: 2, width: 100, height: 50 } },
      edges: { ab: { sourceSide: "bottom", targetSide: null, points: [{ id: "p1", x: 3, y: 4, userCreated: true }] } },
    },
  } as const;

  it("round-trips an active layout and leaves it out in manual mode", () => {
    const state = { ...sampleState(), layout };
    const stored = JSON.parse(JSON.stringify(serializeDocument(state))) as unknown;
    expect(parseDocument(stored).state.layout).toEqual(layout);
    expect(serializeDocument(sampleState())).not.toHaveProperty("layout");
    expect(serializeDocument({ ...sampleState(), layout: null })).not.toHaveProperty("layout");
    expect(parseDocument(serializeDocument(sampleState())).state).not.toHaveProperty("layout");
  });

  it("drops an unusable layout and unusable snapshot entries", () => {
    const base = serializeDocument(sampleState());
    expect(
      parseDocument({ ...base, layout: { engine: "force", direction: "TB", manual: {} } }).state,
    ).not.toHaveProperty("layout");
    expect(parseDocument({ ...base, layout: { engine: "dagre", direction: "BT" } }).state).not.toHaveProperty("layout");
    const parsed = parseDocument({
      ...base,
      layout: {
        engine: "dagre",
        direction: "TB",
        manual: {
          nodes: { a: { x: 1, y: 2, width: 0, height: 5 }, b: "x", c: { x: 0, y: 0, width: 1, height: 1 } },
          edges: { e: 5, f: { sourceSide: "middle", points: "none" } },
        },
      },
    }).state.layout;
    expect(parsed?.manual).toEqual({
      nodes: { c: { x: 0, y: 0, width: 1, height: 1 } },
      edges: { f: { sourceSide: null, targetSide: null, points: [] } },
    });
    expect(
      parseDocument({ ...base, layout: { engine: "dagre", direction: "TB", manual: [] } }).state.layout?.manual,
    ).toEqual({ nodes: {}, edges: {} });
    expect(
      parseDocument({ ...base, layout: { engine: "dagre", direction: "TB", manual: { nodes: [], edges: null } } }).state
        .layout?.manual,
    ).toEqual({ nodes: {}, edges: {} });
  });
});
