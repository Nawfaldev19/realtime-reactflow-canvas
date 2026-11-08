import { useLayoutEffect, type ReactNode } from "react";
import { act, render } from "@testing-library/react";
import { ConnectionLineType, Position, ReactFlowProvider, useStoreApi, type InternalNode } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { serializeDocument } from "../../document/serialize";
import type { DiagramNode } from "../../document/types";
import { node, stateOf } from "../../test/fixtures";
import { EditorStoreProvider } from "../EditorStoreContext";
import type { CanvasNode } from "../flowAdapter";
import { createEditorStore } from "../store";
import { ConnectionPreview } from "./ConnectionPreview";

function internal(model: DiagramNode, x: number, y: number): InternalNode<CanvasNode> {
  return {
    id: model.id,
    position: { x, y },
    data: { node: model },
    width: 100,
    height: 60,
    measured: { width: 100, height: 60 },
    internals: { positionAbsolute: { x, y }, z: 1, userNode: {} },
  } as unknown as InternalNode<CanvasNode>;
}

const A = internal(node("a"), 0, 0);
const B = internal(node("b"), 0, 300);
const C = internal(node("c"), 300, 0);

function Lookup({ children }: { children: ReactNode }) {
  const flow = useStoreApi();
  useLayoutEffect(() => {
    flow.setState({
      nodeLookup: new Map([
        ["a", A],
        ["b", B],
        ["c", C],
      ]) as unknown as ReturnType<typeof flow.getState>["nodeLookup"],
    });
  }, [flow]);
  return children;
}

function renderPreview(
  to: { x: number; y: number },
  {
    toNode = null as InternalNode<CanvasNode> | null,
    toHandle = null as { id: string; position: Position } | null,
  } = {},
) {
  const store = createEditorStore();
  store.getState().load({
    id: "d",
    title: "t",
    revision: 1,
    document: serializeDocument(stateOf([node("a"), node("b"), node("c")])),
    canEdit: true,
  });
  const handle = {
    id: "right",
    nodeId: "a",
    type: "source" as const,
    position: Position.Right,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  };
  const view = render(
    <EditorStoreProvider store={store}>
      <ReactFlowProvider>
        <Lookup>
          <svg>
            <ConnectionPreview
              connectionLineType={ConnectionLineType.Bezier}
              fromNode={A}
              fromHandle={handle}
              fromX={100}
              fromY={30}
              toX={to.x}
              toY={to.y}
              fromPosition={Position.Right}
              toPosition={Position.Left}
              connectionStatus={toNode ? "valid" : null}
              toNode={toNode}
              toHandle={toHandle ? { ...toHandle, nodeId: "b", type: "source", x: 0, y: 0, width: 1, height: 1 } : null}
              pointer={to}
            />
          </svg>
        </Lookup>
      </ReactFlowProvider>
    </EditorStoreProvider>,
  );
  return { store, ...view };
}

const paths = (container: HTMLElement) =>
  [...container.querySelectorAll(".connection-preview__line")].map((path) => path.getAttribute("d"));

describe("ConnectionPreview", () => {
  it("draws the default orthogonal route from the dragged port to the pointer", () => {
    const { container } = renderPreview({ x: 250, y: 200 });
    const [d] = paths(container);
    expect(d).toMatch(/^M 100 30 L 120 30/);
    expect(d).toMatch(/250 200$/);
  });

  it("snaps to a step when the pointer is in its drop zone, and to a port when the library found one", () => {
    const zoned = renderPreview({ x: 50, y: 330 });
    expect(paths(zoned.container)[0]).toMatch(/50 300$/);
    zoned.unmount();
    const ported = renderPreview({ x: 0, y: 330 }, { toNode: B, toHandle: { id: "left", position: Position.Left } });
    expect(paths(ported.container)[0]).toMatch(/0 330$/);
  });

  it("draws a line from the same port of every selected step", () => {
    const { store, container } = renderPreview({ x: 250, y: 400 });
    act(() => {
      store.getState().setSelection(["a", "c"], []);
      store.getState().startConnection("a", "right");
    });
    expect(paths(container)).toHaveLength(2);
    expect(paths(container)[1]).toMatch(/^M 400 30/);
  });

  it("follows the sketch, snapped to right angles for the step style, and shows its points", () => {
    const { store, container } = renderPreview({ x: 250, y: 400 });
    act(() => {
      store.getState().startConnection("a", "right");
      store.getState().setSketching(true);
      store.getState().recordSketch({ x: 200, y: 32 }, { x: 100, y: 30 });
      store.getState().recordSketch({ x: 205, y: 200 }, { x: 100, y: 30 });
    });
    expect(container.querySelectorAll(".connection-preview__point")).toHaveLength(2);
    expect(paths(container)[0]).toContain("200 200");
    act(() => {
      store.getState().setConnectorDefaults({ style: "polyline" });
    });
    expect(paths(container)[0]).toBe("M 100 30 L 200 30 L 200 200 L 250 400");
  });

  it("starts floating previews on the outline facing the pointer", () => {
    const { store, container } = renderPreview({ x: 300, y: 30 });
    act(() => {
      store.getState().setConnectorDefaults({ kind: "floating" });
    });
    expect(paths(container)[0]).toBe("M 100 30 L 300 30");
    const toStep = renderPreview({ x: 50, y: 330 });
    act(() => {
      toStep.store.getState().setConnectorDefaults({ kind: "floating" });
    });
    expect(paths(toStep.container)[0]).toBe("M 50 60 L 50 300");
  });

  it("draws nothing for a source dropped on itself", () => {
    const { container } = renderPreview(
      { x: 50, y: 30 },
      { toNode: A, toHandle: { id: "top", position: Position.Top } },
    );
    expect(paths(container)).toEqual([]);
  });
});
