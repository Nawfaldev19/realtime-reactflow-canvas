import { act, render } from "@testing-library/react";
import type { NodeChange, NodeProps } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parentsOf } from "../document/groups";
import { applyOperation } from "../document/operations";
import type { DocumentState } from "../document/types";
import { renderSummary, resetCounts, startCounting, stopCounting } from "../perf/renderCounts";
import { renderEditor } from "../test/canvas";
import { edge, node, sampleState, stateOf } from "../test/fixtures";
import { handleNodeChanges } from "./canvasChanges";
import { EditorStoreProvider, useEditorShallow } from "./EditorStoreContext";
import { VISIBLE_ONLY_MIN_NODES } from "./Canvas";
import { createEdgeMapper, createNodeMapper, sideHandles, type CanvasNode, type NodeView } from "./flowAdapter";
import { nodeFrame, type NodeBodyProps } from "./nodes/nodeFrame";
import { createEditorStore, type EditorStoreApi } from "./store";

// Guards for the large-diagram rendering techniques (docs/features/performance.md): a drag
// re-renders only the dragged node, selectors and mappers keep their
// references when nothing they read changed, and no-op updates return the
// same objects.

/** 24 steps in a 6 × 4 grid inside jsdom's 500 × 500 canvas, each connected to its right neighbour. */
function gridDocument(): DocumentState {
  const nodes = Array.from({ length: 24 }, (_, index) =>
    node(`n${String(index)}`, {
      number: index + 1,
      z: index + 1,
      position: { x: (index % 6) * 80, y: Math.floor(index / 6) * 100 },
      size: { width: 60, height: 40 },
    }),
  );
  const edges = nodes
    .slice(1)
    .flatMap((target, index) => (index % 6 === 5 ? [] : [edge(`e${String(index)}`, `n${String(index)}`, target.id)]));
  return stateOf(nodes, edges);
}

const dragFrame = (id: string, x: number, y: number, dragging = true): NodeChange<CanvasNode>[] => [
  { type: "position", id, position: { x, y }, dragging },
];

beforeEach(startCounting);
afterEach(stopCounting);

describe("render counts while dragging", () => {
  it("re-renders only the dragged node's frame per drag frame, and commits one operation on release", () => {
    const { store } = renderEditor(gridDocument());
    const before = store.getState().localSeq;
    resetCounts();

    for (let frame = 1; frame <= 10; frame += 1) {
      act(() => {
        handleNodeChanges(dragFrame("n7", 80 + frame * 3, 100 + frame), store);
      });
    }

    const during = renderSummary();
    // The canvas library re-renders the moved node's frame; its memoized content and every other node stay put.
    expect(during.frame.ids).toEqual({ n7: 10 });
    expect(during.content.total).toBe(0);
    // Drag frames never reach the root (chrome) and never become operations.
    expect(during.root.total).toBe(0);
    expect(during.flow.total).toBe(10);
    expect(store.getState().localSeq).toBe(before);
    // No connector other than those attached to the dragged node redraws (e6: n6 → n7, e7: n7 → n8).
    expect(Object.keys(during.edge.ids).filter((id) => id !== "e6" && id !== "e7")).toEqual([]);

    resetCounts();
    act(() => {
      handleNodeChanges(dragFrame("n7", 110, 110, false), store);
    });
    const release = renderSummary();
    expect(store.getState().localSeq).toBe(before + 1);
    expect(store.getState().doc.nodes.n7?.position).toEqual({ x: 110, y: 110 });
    expect(release.root.total).toBe(1);
    expect(Object.keys(release.frame.ids)).toEqual(["n7"]);
    expect(Object.keys(release.content.ids)).toEqual(["n7"]);
  });

  it("with the no-batch flag every drag frame is an operation that re-renders the root (the storm the flag measures)", () => {
    const { store } = renderEditor(gridDocument());
    const before = store.getState().localSeq;
    resetCounts();
    for (let frame = 1; frame <= 5; frame += 1) {
      act(() => {
        handleNodeChanges(dragFrame("n7", 80 + frame * 3, 100), store, undefined, { batch: false });
      });
    }
    expect(store.getState().localSeq).toBe(before + 5);
    expect(renderSummary().root.total).toBe(5);
    expect(renderSummary().content.ids).toEqual({ n7: 5 });
  });
});

describe("visible-only rendering", () => {
  it("mounts only the steps in view on a large diagram, and everything while something reads the DOM", () => {
    const nodes = Array.from({ length: VISIBLE_ONLY_MIN_NODES + 20 }, (_, index) =>
      node(`v${String(index)}`, {
        number: index + 1,
        z: index + 1,
        position: { x: (index % 20) * 100, y: Math.floor(index / 20) * 100 },
        size: { width: 60, height: 40 },
      }),
    );
    const { store, container } = renderEditor(stateOf(nodes));
    const mounted = () => container.querySelectorAll(".react-flow__node").length;
    // jsdom's canvas is 500 × 500 at 100%: five columns and five rows are in view.
    expect(mounted()).toBe(25);
    act(() => {
      store.getState().setRenderAll(true);
    });
    expect(mounted()).toBe(nodes.length);
    act(() => {
      store.getState().setRenderAll(false);
    });
    expect(mounted()).toBe(25);
  });

  it("keeps small diagrams fully mounted", () => {
    const { container } = renderEditor(
      stateOf([node("near"), node("far", { number: 2, position: { x: 3000, y: 3000 } })]),
    );
    expect(container.querySelectorAll(".react-flow__node")).toHaveLength(2);
  });

  it("gives never-measured nodes static side handles, so their connectors can be drawn before they mount", () => {
    const toNodes = createNodeMapper();
    const doc = stateOf([node("a", { size: { width: 100, height: 40 } }), node("n", { kind: "note", number: 2 })]);
    const [step, note] = toNodes({
      doc,
      selected: [],
      dragPositions: {},
      measured: {},
      canEdit: true,
      staticHandles: true,
    });
    expect(step?.handles).toEqual(sideHandles({ width: 100, height: 40 }));
    expect(step?.handles?.map((handle) => [handle.id, handle.x, handle.y])).toEqual([
      ["top", 50, 0],
      ["right", 100, 20],
      ["bottom", 50, 40],
      ["left", 0, 20],
    ]);
    // Notes cannot be connected; measured nodes use the handles the library measured.
    expect(note?.handles).toBeUndefined();
    const [measuredStep] = toNodes({
      doc,
      selected: [],
      dragPositions: {},
      measured: { a: { width: 100, height: 40 } },
      canEdit: true,
      staticHandles: true,
    });
    expect(measuredStep?.handles).toBeUndefined();
  });
});

describe("memoized node content", () => {
  const frameProps = (x: number, selected = false): NodeProps<CanvasNode> => ({
    id: "a",
    type: "step",
    data: { node: node("a") },
    selected,
    positionAbsoluteX: x,
    positionAbsoluteY: 0,
    dragging: true,
    zIndex: 1,
    isConnectable: true,
    draggable: true,
    selectable: true,
    deletable: true,
  });

  it("skips the body when only the position changes, and renders it for a selection change", () => {
    const body = vi.fn((props: NodeBodyProps) => <span>{props.node.id}</span>);
    const Frame = nodeFrame(body, true);
    const data = { node: node("a") };
    const { rerender } = render(<Frame {...frameProps(0)} data={data} />);
    rerender(<Frame {...frameProps(10)} data={{ node: data.node }} />);
    rerender(<Frame {...frameProps(20)} data={{ node: data.node }} />);
    expect(body).toHaveBeenCalledTimes(1);
    rerender(<Frame {...frameProps(20, true)} data={{ node: data.node }} />);
    expect(body).toHaveBeenCalledTimes(2);
  });

  it("renders the body on every frame without memoization (the no-memo flag)", () => {
    const body = vi.fn((props: NodeBodyProps) => <span>{props.node.id}</span>);
    const Frame = nodeFrame(body, false);
    const data = { node: node("a") };
    const { rerender } = render(<Frame {...frameProps(0)} data={data} />);
    rerender(<Frame {...frameProps(10)} data={data} />);
    expect(body).toHaveBeenCalledTimes(2);
  });
});

describe("selector stability", () => {
  function renderProbe(store: EditorStoreApi) {
    const renders = vi.fn();
    function Probe() {
      const slice = useEditorShallow((state) => ({ selected: state.selectedNodeIds, canEdit: state.canEdit }));
      renders(slice);
      return null;
    }
    render(
      <EditorStoreProvider store={store}>
        <Probe />
      </EditorStoreProvider>,
    );
    return renders;
  }

  it("re-renders an object selector only when one of its entries changes", () => {
    const store = createEditorStore();
    store.getState().load({
      id: "d",
      title: "T",
      revision: 1,
      document: { nodes: [node("a"), node("b")], edges: [] },
      canEdit: true,
    });
    const renders = renderProbe(store);
    expect(renders).toHaveBeenCalledTimes(1);
    act(() => {
      store.getState().setDragPositions({ a: { x: 5, y: 5 } });
      store.getState().setMeasured({ a: { width: 100, height: 50 } });
    });
    expect(renders).toHaveBeenCalledTimes(1);
    act(() => {
      store.getState().setSelection(["a"], []);
    });
    expect(renders).toHaveBeenCalledTimes(2);
    act(() => {
      store.getState().setSelection(["a"], []);
    });
    expect(renders).toHaveBeenCalledTimes(2);
  });

  function view(overrides: Partial<NodeView> = {}): NodeView {
    return { doc: sampleState(), selected: [], dragPositions: {}, measured: {}, canEdit: true, ...overrides };
  }

  it("the node mapper returns the same array for the same inputs, and the same objects for unmoved nodes", () => {
    const toNodes = createNodeMapper();
    const base = view();
    const first = toNodes(base);
    expect(toNodes({ ...base, selected: [] })).toBe(first);
    const moved = toNodes({ ...base, dragPositions: { c: { x: 1, y: 2 } } });
    expect(moved).not.toBe(first);
    for (const [index, entry] of moved.entries()) {
      if (entry.id === "c") expect(entry).not.toBe(first[index]);
      else expect(entry).toBe(first[index]);
    }
  });

  it("the edge mapper returns the same array while no connector changed", () => {
    const toEdges = createEdgeMapper();
    const doc = sampleState();
    const first = toEdges({ doc, selected: [] });
    expect(toEdges({ doc, selected: [] })).toBe(first);
    expect(toEdges({ doc, selected: ["ab"] })).not.toBe(first);
    const unreused = createEdgeMapper({ reuse: false });
    expect(unreused({ doc, selected: [] })).not.toBe(unreused({ doc, selected: [] }));
  });

  it("derives a group's child set once per document", () => {
    const doc = sampleState();
    expect(parentsOf(doc)).toBe(parentsOf(doc));
    expect([...parentsOf(doc)]).toEqual(["g"]);
    const next = applyOperation(doc, { type: "node.update", id: "a", fields: { parentId: null } }).state;
    expect(parentsOf(next)).not.toBe(parentsOf(doc));
    expect([...parentsOf(next)]).toEqual(["g"]);
  });
});

describe("no-op guards", () => {
  function loaded(guards?: boolean) {
    const store = createEditorStore(guards === undefined ? {} : { guards });
    store
      .getState()
      .load({ id: "d", title: "T", revision: 1, document: { nodes: [node("a")], edges: [] }, canEdit: true });
    const listener = vi.fn();
    store.subscribe(listener);
    return { store, listener };
  }

  it("a drag or measurement frame that changes nothing keeps the same state and notifies no one", () => {
    const { store, listener } = loaded();
    store.getState().setDragPositions({ a: { x: 5, y: 5 } });
    store.getState().setMeasured({ a: { width: 100, height: 50 } });
    expect(listener).toHaveBeenCalledTimes(2);
    const { dragPositions, measured } = store.getState();
    store.getState().setDragPositions({ a: { x: 5, y: 5 } });
    store.getState().setDragPositions({});
    store.getState().setMeasured({ a: { width: 100, height: 50 } });
    expect(store.getState().dragPositions).toBe(dragPositions);
    expect(store.getState().measured).toBe(measured);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("an operation that changes nothing returns the same document and records nothing", () => {
    const { store, listener } = loaded();
    const { doc, localSeq } = store.getState();
    expect(applyOperation(doc, { type: "node.update", id: "a", fields: { position: { x: 0, y: 0 } } }).state).toBe(doc);
    expect(store.getState().apply({ type: "node.update", id: "a", fields: { position: { x: 0, y: 0 } } })).toBe(false);
    expect(store.getState().doc).toBe(doc);
    expect(store.getState().localSeq).toBe(localSeq);
    expect(listener).not.toHaveBeenCalled();
  });

  it("without guards (the no-guards flag) every frame replaces the record and notifies", () => {
    const { store, listener } = loaded(false);
    store.getState().setDragPositions({ a: { x: 5, y: 5 } });
    const { dragPositions } = store.getState();
    store.getState().setDragPositions({ a: { x: 5, y: 5 } });
    expect(store.getState().dragPositions).not.toBe(dragPositions);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("the node mapper without reuse builds new objects every time", () => {
    const toNodes = createNodeMapper({ reuse: false });
    const input: NodeView = { doc: sampleState(), selected: [], dragPositions: {}, measured: {}, canEdit: true };
    const first = toNodes(input);
    const second = toNodes(input);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    expect(second).toEqual(first);
  });
});
