import { useLayoutEffect } from "react";
import { onTestFinished } from "vitest";
import { render } from "@testing-library/react";
import { Position, ReactFlowProvider, useStoreApi, type InternalNode } from "@xyflow/react";
import { serializeDocument } from "../document/serialize";
import type { DiagramEdge, DiagramNode } from "../document/types";
import { ConnectorEdge } from "../editor/edges/ConnectorEdge";
import { EditorStoreProvider, useEditor } from "../editor/EditorStoreContext";
import type { CanvasNode } from "../editor/flowAdapter";
import { createEditorStore } from "../editor/store";
import { RevealProvider } from "../preview/reveal";
import type { RevealController } from "../reveal/controller";
import { edge, node, stateOf } from "./fixtures";

export interface ConnectorSetup {
  readonly selected?: boolean;
  readonly endpointSelected?: boolean;
  readonly canEdit?: boolean;
  readonly zoom?: number;
  readonly ghost?: boolean;
  /** The canvas library's handle positions: the connector draws between them (no measured steps in jsdom). */
  readonly from?: { x: number; y: number; position: Position };
  readonly to?: { x: number; y: number; position: Position };
  /** Live canvas nodes (absolute boxes) for the connector to attach to; omitted ones count as unmeasured. */
  readonly boxes?: Readonly<Record<string, { x: number; y: number; width: number; height: number }>>;
  /** Renders inside a preview's reveal animation. */
  readonly reveal?: RevealController;
}

function internalNode(
  model: DiagramNode,
  box: { x: number; y: number; width: number; height: number },
): InternalNode<CanvasNode> {
  return {
    id: model.id,
    position: { x: box.x, y: box.y },
    data: { node: model },
    width: box.width,
    height: box.height,
    measured: { width: box.width, height: box.height },
    internals: { positionAbsolute: { x: box.x, y: box.y }, z: 1, userNode: {} },
  } as unknown as InternalNode<CanvasNode>;
}

/**
 * Renders one connector "e" from "a" to "b" outside a full canvas. jsdom has
 * no layout, so the connector uses the library's handle positions, and the
 * canvas element (for labels and pointer conversion) is a plain element at
 * the origin with the given zoom.
 */
export function renderConnector(
  overrides: Partial<DiagramEdge> = {},
  {
    selected = true,
    endpointSelected = false,
    canEdit = true,
    zoom = 1,
    ghost = false,
    from,
    to,
    boxes = {},
    reveal,
  }: ConnectorSetup = {},
) {
  const store = createEditorStore();
  const doc = stateOf(
    [
      node("a"),
      node("b", { number: 2, position: { x: 0, y: 300 }, data: { text: "Target" } }),
      node("c", { number: 3, position: { x: 600, y: 0 } }),
    ],
    [edge("e", "a", "b", overrides)],
  );
  store.getState().load({ id: "d1", title: "Plan", revision: 1, document: serializeDocument(doc), canEdit });
  const canvas = document.createElement("div");
  const layer = document.createElement("div");
  layer.className = "react-flow__edgelabel-renderer";
  canvas.append(layer);
  document.body.append(canvas);
  onTestFinished(() => {
    canvas.remove();
  });
  const source = from ?? { x: 0, y: 0, position: Position.Bottom };
  const target = to ?? { x: 0, y: 200, position: Position.Top };

  function Canvas() {
    const flow = useStoreApi();
    useLayoutEffect(() => {
      const lookup = new Map(
        Object.entries(boxes).flatMap(([id, box]) => {
          const model = doc.nodes[id];
          return model ? [[id, internalNode(model, box)] as const] : [];
        }),
      );
      flow.setState({
        domNode: canvas,
        transform: [0, 0, zoom],
        nodeLookup: lookup as unknown as ReturnType<typeof flow.getState>["nodeLookup"],
      });
    }, [flow]);
    return null;
  }

  function Connector() {
    const current = useEditor((state) => state.doc.edges.e);
    if (!current) return null;
    return (
      <ConnectorEdge
        id="e"
        source="a"
        target="b"
        sourceX={source.x}
        sourceY={source.y}
        targetX={target.x}
        targetY={target.y}
        sourcePosition={source.position}
        targetPosition={target.position}
        selected={selected}
        data={{ edge: current, endpointSelected, ghost }}
        animated={false}
        deletable
        selectable
        markerStart={undefined}
        markerEnd={undefined}
      />
    );
  }

  const tree = (
    <EditorStoreProvider store={store}>
      <ReactFlowProvider>
        <Canvas />
        <svg>
          <g className="react-flow__edge" data-id="e" tabIndex={0}>
            <Connector />
          </g>
        </svg>
      </ReactFlowProvider>
    </EditorStoreProvider>
  );
  const view = render(reveal ? <RevealProvider controller={reveal}>{tree}</RevealProvider> : tree);
  return { store, layer, ...view };
}
