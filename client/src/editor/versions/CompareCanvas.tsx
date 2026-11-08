import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import { KIND_TRAITS } from "../../document/nodeKinds";
import { serializeDocument } from "../../document/serialize";
import type { DiagramNode, DocumentState } from "../../document/types";
import type { ChangeStatus } from "../../versions/diff";
import {
  HIGHLIGHT_LABELS,
  HIGHLIGHT_LIFT,
  highlightOf,
  type CompareFilters,
  type Highlight,
} from "../../versions/highlight";
import { handleNodeChanges } from "../canvasChanges";
import { edgeTypes } from "../edges/ConnectorEdge";
import { EditorStoreProvider, useEditor, useEditorStoreApi } from "../EditorStoreContext";
import { createEdgeMapper, createNodeMapper, type CanvasEdge, type CanvasNode } from "../flowAdapter";
import { nodeTypes } from "../nodes";

// One read-only drawing in the compare view. It renders with the editor's own
// node and connector components from a private read-only store, and adds the
// highlight of each entity as render props (a class name and an accessible
// name), never by touching the DOM, so highlights survive
// re-renders and panning. It opens fitted to the highlighted steps.

const NO_IDS: readonly string[] = [];
const NO_POSITIONS = {};

/** A pan or zoom made by the person on one side, for the other side to follow. */
export interface SharedViewport {
  readonly viewport: Viewport;
  readonly source: string;
}

interface CompareCanvasProps {
  /** Names the drawing ("Current diagram", "v3 · Legs glued"). */
  readonly label: string;
  readonly doc: DocumentState;
  readonly nodeStatus: Readonly<Record<string, ChangeStatus>>;
  readonly edgeStatus: Readonly<Record<string, ChangeStatus>>;
  readonly filters: CompareFilters;
  /** A step or connector was clicked (null: the empty canvas). */
  readonly onPick: (id: string | null) => void;
  readonly picked: string | null;
  readonly shared?: SharedViewport | null;
  readonly onShare?: (shared: SharedViewport) => void;
}

const nameOf = (node: DiagramNode): string => {
  const text = typeof node.data.text === "string" ? node.data.text.trim() : "";
  return text || `${KIND_TRAITS[node.kind].label} ${String(node.number)}`;
};

function decorate(node: CanvasNode, highlight: Highlight, picked: boolean): CanvasNode {
  const lifted = highlight !== "plain" && highlight !== "hidden" && node.type !== "group";
  return {
    ...node,
    className: `diff diff--${highlight}${picked ? " diff--picked" : ""}`,
    ariaLabel:
      highlight === "plain" || highlight === "hidden"
        ? nameOf(node.data.node)
        : `${HIGHLIGHT_LABELS[highlight]}: ${nameOf(node.data.node)}`,
    selectable: highlight !== "hidden",
    ...(lifted ? { zIndex: (node.zIndex ?? 0) + HIGHLIGHT_LIFT } : {}),
  };
}

function CompareFlow({
  label,
  nodeStatus,
  edgeStatus,
  filters,
  onPick,
  picked,
  shared,
  onShare,
}: Omit<CompareCanvasProps, "doc">) {
  const api = useEditorStoreApi();
  const doc = useEditor((state) => state.doc);
  const measured = useEditor((state) => state.measured);
  const { setViewport } = useReactFlow();
  const [toNodes] = useState(createNodeMapper);
  const [toEdges] = useState(createEdgeMapper);
  const base = useMemo(
    () => toNodes({ doc, selected: NO_IDS, dragPositions: NO_POSITIONS, measured, canEdit: false }),
    [toNodes, doc, measured],
  );
  const nodes = useMemo(
    () => base.map((node) => decorate(node, highlightOf(nodeStatus[node.id], filters), node.id === picked)),
    [base, nodeStatus, filters, picked],
  );
  const edges = useMemo(
    () =>
      toEdges({ doc, selected: NO_IDS }).map((edge): CanvasEdge => {
        const highlight = highlightOf(edgeStatus[edge.id], filters);
        return { ...edge, className: `diff diff--${highlight}${edge.id === picked ? " diff--picked" : ""}` };
      }),
    [toEdges, doc, edgeStatus, filters, picked],
  );
  // Opens fitted to the highlighted steps (all steps when nothing changed); later changes never refit.
  const [fitOptions] = useState(() => {
    const highlighted = Object.keys(nodeStatus).filter((id) => nodeStatus[id] !== "unchanged" && id in doc.nodes);
    return {
      padding: 0.2,
      maxZoom: 1,
      ...(highlighted.length > 0 ? { nodes: highlighted.map((id) => ({ id })) } : {}),
    };
  });

  useEffect(() => {
    if (shared && shared.source !== label) void setViewport(shared.viewport);
  }, [shared, label, setViewport]);

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      handleNodeChanges(changes, api);
    },
    [api],
  );

  return (
    <ReactFlow<CanvasNode, CanvasEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      connectionMode={ConnectionMode.Loose}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      zIndexMode="manual"
      elevateNodesOnSelect={false}
      elevateEdgesOnSelect={false}
      fitView
      fitViewOptions={fitOptions}
      minZoom={0.1}
      maxZoom={2}
      onNodeClick={(_, node) => onPick(node.id)}
      onEdgeClick={(_, edge) => onPick(edge.id)}
      onPaneClick={() => onPick(null)}
      onMove={(event, viewport) => {
        // Only a person's pan or zoom is shared; following the other side must not echo back.
        if (event && onShare) onShare({ viewport, source: label });
      }}
      aria-label={label}
    />
  );
}

const loadInto = (api: ReturnType<typeof useEditorStoreApi>, doc: DocumentState) => {
  api.getState().load({ id: "compare", title: "", revision: 0, document: serializeDocument(doc), canEdit: false });
};

/** Loads `doc` into a private read-only store before the first render, and again whenever it changes. */
function Loader({ doc }: { doc: DocumentState }) {
  const api = useEditorStoreApi();
  const loaded = useRef<DocumentState | null>(null);
  if (loaded.current === null) {
    loaded.current = doc;
    loadInto(api, doc);
  }
  useEffect(() => {
    if (loaded.current === doc) return;
    loaded.current = doc;
    loadInto(api, doc);
  }, [api, doc]);
  return null;
}

export function CompareCanvas({ doc, ...props }: CompareCanvasProps) {
  return (
    <EditorStoreProvider>
      <ReactFlowProvider>
        <Loader doc={doc} />
        <section className="editor-canvas compare-canvas" aria-label={props.label}>
          <h3 className="compare-canvas__title">{props.label}</h3>
          <CompareFlow {...props} />
        </section>
      </ReactFlowProvider>
    </EditorStoreProvider>
  );
}
