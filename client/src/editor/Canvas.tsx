import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useStore,
  useStoreApi,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnConnectEnd,
  type OnConnectStart,
  type ReactFlowProps,
} from "@xyflow/react";
import { canConnect } from "../document/connections";
import { SHAPE_DRAG_TYPE, decodeLibraryPayload } from "../document/library";
import { connectionOutcome, handleEdgeChanges, handleNodeChanges, sideOf, type SnapContext } from "./canvasChanges";
import { DropMenu } from "./DropMenu";
import { ConnectionPreview } from "./edges/ConnectionPreview";
import { edgeTypes } from "./edges/ConnectorEdge";
import { nodeHits, PORT_RADIUS } from "./edges/hits";
import { useEditor, useEditorShallow, useEditorStoreApi } from "./EditorStoreContext";
import { createEdgeMapper, createNodeMapper, type CanvasEdge, type CanvasNode } from "./flowAdapter";
import { GuideOverlay } from "./GuideOverlay";
import { nodeTypes } from "./nodes";
import { RouteNotice } from "./RouteNotice";
import { SearchPanel } from "./SearchPanel";
import { SelectionToolbar } from "./SelectionToolbar";
import { SketchOverlay } from "./SketchOverlay";
import { Snapper } from "./snapping";
import { useClipboard } from "./useClipboard";
import { useConnectionSketch } from "./useConnectionSketch";
import type { NavigationMode } from "../viewport/navigation";
import type { BackgroundPattern } from "../viewport/settings";
import { Scrollbars } from "../view/Scrollbars";
import { useViewChrome } from "../view/useViewChrome";
import { ViewFooter } from "../view/ViewFooter";
import { roundPoint, screenToFlow } from "../collab/coordinates";
import { PresenceOverlay } from "./PresenceOverlay";
import { useCollabClient } from "./useCollaboration";
import { perfFlags } from "../perf/flags";
import { countRender } from "../perf/renderCounts";
import { useStableCallback } from "../perf/useStableCallback";

// The diagram canvas: maps the store onto the canvas library and turns its
// events into store actions. Finishing a connection uses the connection-end
// state's validity flag and screenToFlowPosition, adapted from the React Flow
// "Add Node On Edge Drop" example (MIT); dropping library shapes follows the
// React Flow "Drag and Drop" example (MIT); see docs/REFERENCES.md.
//
// Two components. The root owns the chrome (view footer, overlays,
// scrollbars, the drop target) and subscribes only to what changes per
// committed operation. The flow layer below it feeds the canvas library and
// subscribes to the per-frame state (drag positions, live fields, measured
// sizes), so a drag frame re-renders the flow layer and the moved node's
// frame, never the root or its chrome. Every handler passed to the canvas is
// a stable callback, and steps outside the viewport are not mounted on large
// diagrams (visible-only rendering; export switches it off while capturing).
// These follow the React Flow performance guide (MIT docs); see ADR-004.

// Static canvas options live outside the component so the canvas never sees
// new objects on re-render (a requirement for large diagrams, see docs/features/performance.md). There is
// deliberately no automatic fit: the opening view is applied once (useOpeningView).
const DELETE_KEYS = ["Backspace", "Delete"];
/** Either Ctrl or Cmd adds to the selection, on every platform. */
const MULTI_SELECT_KEYS = ["Meta", "Control"];

const PATTERNS: Readonly<Record<Exclude<BackgroundPattern, "none">, BackgroundVariant>> = {
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
  cross: BackgroundVariant.Cross,
};

/** Below this many nodes everything stays mounted: culling would cost more than it saves. */
export const VISIBLE_ONLY_MIN_NODES = 200;

const clientPoint = (event: globalThis.MouseEvent | TouchEvent) => {
  const touch = "changedTouches" in event ? event.changedTouches[0] : undefined;
  return touch
    ? { x: touch.clientX, y: touch.clientY }
    : { x: (event as globalThis.MouseEvent).clientX, y: (event as globalThis.MouseEvent).clientY };
};

interface DiagramCanvasProps {
  readonly navigationMode?: NavigationMode;
  readonly onNavigationMode?: ((mode: NavigationMode) => void) | undefined;
}

type FlowInteraction = Pick<
  ReactFlowProps,
  | "panOnDrag"
  | "panOnScroll"
  | "zoomOnScroll"
  | "zoomOnPinch"
  | "zoomOnDoubleClick"
  | "selectionOnDrag"
  | "translateExtent"
>;

interface FlowLayerProps {
  readonly wrapper: RefObject<HTMLDivElement>;
  readonly interaction: FlowInteraction;
  readonly canEdit: boolean;
  readonly connecting: boolean;
  readonly children: ReactNode;
}

/** The canvas library and everything it needs per frame. */
function FlowLayer({ wrapper, interaction, canEdit, connecting, children }: FlowLayerProps) {
  countRender("flow");
  const api = useEditorStoreApi();
  const flow = useStoreApi<CanvasNode>();
  const { screenToFlowPosition } = useReactFlow();
  const {
    doc,
    selectedNodeIds,
    selectedEdgeIds,
    dragPositions,
    measured,
    live,
    editingNodeId,
    detachMode,
    pendingDrop,
    defaults,
    renderAll,
  } = useEditorShallow((state) => ({
    doc: state.doc,
    selectedNodeIds: state.selectedNodeIds,
    selectedEdgeIds: state.selectedEdgeIds,
    dragPositions: state.dragPositions,
    measured: state.measured,
    live: state.live,
    editingNodeId: state.editingNodeId,
    detachMode: state.detachMode,
    pendingDrop: state.pendingDrop,
    defaults: state.connectorDefaults,
    renderAll: state.renderAll,
  }));
  // Ports catch a connection within 30 screen pixels at any zoom.
  const connectionRadius = useStore((state) => Math.round(PORT_RADIUS / state.transform[2]));
  const [toNodes] = useState(() => createNodeMapper({ reuse: perfFlags.guards }));
  const [toEdges] = useState(() => createEdgeMapper({ reuse: perfFlags.guards }));
  // The snapper keeps its guide index outside React state; only the visible guides are reactive.
  const [snap] = useState<SnapContext>(() => ({
    snapper: new Snapper(),
    view: () => {
      const { transform, width, height } = flow.getState();
      return { viewport: { x: transform[0], y: transform[1], zoom: transform[2] }, width, height };
    },
  }));
  const visibleOnly = perfFlags.visible && !renderAll && Object.keys(doc.nodes).length >= VISIBLE_ONLY_MIN_NODES;

  const nodes = useMemo(
    () =>
      toNodes({
        doc,
        selected: selectedNodeIds,
        dragPositions,
        measured,
        canEdit,
        live,
        editingNodeId,
        detachMode,
        pendingDrop,
        staticHandles: visibleOnly,
      }),
    [
      toNodes,
      doc,
      selectedNodeIds,
      dragPositions,
      measured,
      canEdit,
      live,
      editingNodeId,
      detachMode,
      pendingDrop,
      visibleOnly,
    ],
  );
  const edges = useMemo(
    () => toEdges({ doc, selected: selectedEdgeIds, selectedNodes: selectedNodeIds, pendingDrop, defaults }),
    [toEdges, doc, selectedEdgeIds, selectedNodeIds, pendingDrop, defaults],
  );

  const onNodesChange = useStableCallback((changes: NodeChange<CanvasNode>[]) => {
    handleNodeChanges(changes, api, snap);
  });
  const onEdgesChange = useStableCallback((changes: EdgeChange<CanvasEdge>[]) => {
    handleEdgeChanges(changes, api);
  });
  const onConnectStart: OnConnectStart = useStableCallback((_event, { nodeId, handleId }) => {
    if (nodeId) api.getState().startConnection(nodeId, sideOf(handleId));
  });
  const onConnectEnd: OnConnectEnd = useStableCallback((event, state) => {
    const session = api.getState().connection;
    const [primary] = session?.sources ?? [];
    if (!session || primary === undefined) return;
    const client = clientPoint(event);
    const point = screenToFlowPosition(client);
    const outcome = connectionOutcome({
      isValid: state.isValid,
      toNode: state.toNode?.id ?? null,
      toHandle: state.toHandle?.id ?? null,
      point,
      hits: nodeHits(flow.getState().nodeLookup),
      from: primary,
    });
    if (outcome.kind === "drop") {
      const rect = wrapper.current?.getBoundingClientRect();
      api.getState().openDrop(point, { x: client.x - (rect?.left ?? 0), y: client.y - (rect?.top ?? 0) });
      return;
    }
    if (outcome.kind === "connect")
      api.getState().connectMany(session.sources, outcome.target, session.side, outcome.targetSide, session.sketch);
    api.getState().endConnection();
  });
  const isValidConnection = useStableCallback((connection: Connection | Edge) =>
    canConnect(api.getState().doc, connection.source, connection.target),
  );
  const onNodeDoubleClick = useStableCallback((_event: MouseEvent, node: CanvasNode) => {
    api.getState().startEditing(node.id);
  });
  const onPaneClick = useStableCallback(() => {
    api.getState().cancelDrop();
    api.getState().stopLabelEdit();
  });

  return (
    <ReactFlow<CanvasNode, CanvasEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      connectionLineComponent={ConnectionPreview}
      connectionRadius={connectionRadius}
      isValidConnection={isValidConnection}
      onNodeDoubleClick={onNodeDoubleClick}
      onPaneClick={onPaneClick}
      connectionMode={ConnectionMode.Loose}
      zIndexMode="manual"
      elevateNodesOnSelect={false}
      elevateEdgesOnSelect={false}
      onlyRenderVisibleElements={visibleOnly}
      {...interaction}
      nodesDraggable={canEdit}
      nodesConnectable={canEdit}
      // Space sketches a route while connecting, so it must not switch the canvas to panning then.
      panActivationKeyCode={connecting ? null : "Space"}
      deleteKeyCode={canEdit ? DELETE_KEYS : null}
      multiSelectionKeyCode={MULTI_SELECT_KEYS}
      minZoom={0.1}
      maxZoom={2}
      aria-label="Diagram canvas"
    >
      {children}
    </ReactFlow>
  );
}

export function DiagramCanvas({ navigationMode = "pan", onNavigationMode }: DiagramCanvasProps) {
  countRender("root");
  const api = useEditorStoreApi();
  const flow = useStoreApi<CanvasNode>();
  const { screenToFlowPosition } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const { doc, canEdit, drawMode, connecting } = useEditorShallow((state) => ({
    doc: state.doc,
    canEdit: state.canEdit,
    drawMode: state.drawMode,
    connecting: state.connection !== null,
  }));
  const openingView = useEditor((state) => state.viewSettings.openingView);
  const background = useEditor((state) => state.viewSettings.background);
  const view = useViewChrome({ context: "editor", mode: navigationMode, doc, openingView, drawing: drawMode });
  const collab = useCollabClient();
  // The zoom goes to CSS (counter-scaled chrome) without re-rendering the root on every zoom frame.
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const show = (zoom: number) => {
      element.style.setProperty("--canvas-zoom", String(zoom));
    };
    show(flow.getState().transform[2]);
    return flow.subscribe((state, previous) => {
      if (state.transform[2] !== previous.transform[2]) show(state.transform[2]);
    });
  }, [flow]);
  // Cursors are shared in canvas coordinates, so they land on the same spot of the diagram for everyone.
  const onPointerMove = useStableCallback((event: PointerEvent) => {
    const { domNode, transform } = flow.getState();
    const pane = domNode?.getBoundingClientRect();
    if (!collab || !pane) return;
    collab.setCursor(
      roundPoint(
        screenToFlow(
          { x: event.clientX, y: event.clientY },
          { x: pane.left, y: pane.top },
          { x: transform[0], y: transform[1], zoom: transform[2] },
        ),
      ),
    );
  });
  const onPointerLeave = useStableCallback(() => collab?.setCursor(null));
  useConnectionSketch(api, connecting);
  useClipboard(api, wrapper, screenToFlowPosition);

  const onDragOver = useStableCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes(SHAPE_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = api.getState().canEdit ? "move" : "none";
  });
  const onDrop = useStableCallback((event: DragEvent) => {
    const item = decodeLibraryPayload(event.dataTransfer.getData(SHAPE_DRAG_TYPE));
    if (!item) return;
    event.preventDefault();
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    api.getState().addFromLibrary(item, { x: Math.round(point.x), y: Math.round(point.y) });
  });

  const className = [
    "editor-canvas",
    drawMode ? "editor-canvas--drawing" : "",
    connecting ? "editor-canvas--connecting" : "",
    view.opened ? "" : "canvas--opening",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      ref={wrapper}
      className={className}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onKeyDown={view.onKeyDown}
      // Focusable so keyboard users can pan and zoom; clicks on the pane focus it too.
      tabIndex={0}
      role="region"
      aria-label="Diagram editor. With nothing selected, arrow keys pan, plus and minus zoom, 0 returns to the opening view."
    >
      <FlowLayer wrapper={wrapper} interaction={view.flow} canEdit={canEdit} connecting={connecting}>
        {background.pattern !== "none" && <Background variant={PATTERNS[background.pattern]} gap={background.gap} />}
        {view.minimap && <MiniMap pannable zoomable ariaLabel="Minimap" />}
        <SelectionToolbar />
        {collab && <PresenceOverlay presence={collab.presence} />}
      </FlowLayer>
      {view.scrollbars && view.extent && <Scrollbars extent={view.extent} actions={view.actions} />}
      <ViewFooter
        actions={view.actions}
        onOpeningView={view.showOpening}
        scrollbars={view.scrollbars}
        onScrollbars={view.setScrollbars}
        minimap={view.minimap}
        onMinimap={view.setMinimap}
        mode={navigationMode}
        onMode={onNavigationMode}
      />
      <GuideOverlay />
      <SearchPanel />
      <SketchOverlay />
      <DropMenu />
      <RouteNotice />
    </div>
  );
}
