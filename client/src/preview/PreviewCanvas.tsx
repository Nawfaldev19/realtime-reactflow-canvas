import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { ConnectionMode, MiniMap, ReactFlow, type NodeChange } from "@xyflow/react";
import { handleNodeChanges } from "../editor/canvasChanges";
import { useEditorShallow, useEditorStoreApi } from "../editor/EditorStoreContext";
import { edgeTypes } from "../editor/edges/ConnectorEdge";
import { createEdgeMapper, createNodeMapper, type CanvasEdge, type CanvasNode } from "../editor/flowAdapter";
import { nodeTypes } from "../editor/nodes";
import type { NavigationMode } from "../viewport/navigation";
import { Scrollbars } from "../view/Scrollbars";
import type { ViewChrome } from "../view/useViewChrome";
import { ViewFooter } from "../view/ViewFooter";
import { RevealControls } from "./RevealControls";
import { RevealProvider } from "./reveal";
import type { Reveal } from "./useReveal";

// The read-only presentation surface. It renders the same node and connector
// components as the editor, from a store loaded read-only, with nothing
// draggable, connectable, selectable or focusable, no background pattern, and
// the build-up reveal animation when the diagram asks for it. Any pan, zoom,
// click or navigation key finishes the animation at once.

const NO_IDS: readonly string[] = [];
const NO_POSITIONS = {};

interface PreviewCanvasProps {
  /** The surface's view commands and settings (from useViewChrome with the preview context). */
  readonly view: ViewChrome;
  readonly reveal: Reveal;
  readonly navigationMode: NavigationMode;
  readonly onNavigationMode?: ((mode: NavigationMode) => void) | undefined;
}

export function PreviewCanvas({ view, reveal, navigationMode, onNavigationMode }: PreviewCanvasProps) {
  const api = useEditorStoreApi();
  const { doc, measured } = useEditorShallow((state) => ({ doc: state.doc, measured: state.measured }));
  const [toNodes] = useState(createNodeMapper);
  const [toEdges] = useState(createEdgeMapper);
  const nodes = useMemo(
    () => toNodes({ doc, selected: NO_IDS, dragPositions: NO_POSITIONS, measured, canEdit: false }),
    [toNodes, doc, measured],
  );
  const edges = useMemo(() => toEdges({ doc, selected: NO_IDS }), [toEdges, doc]);
  const { skip } = reveal;
  // Read-only: the only changes are measured sizes, which connectors need to attach.
  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      handleNodeChanges(changes, api);
    },
    [api],
  );

  const onMoveStart = useCallback(
    (event: MouseEvent | TouchEvent | null) => {
      // Only people move the view with an event; the opening view and the buttons do not.
      if (event) skip();
    },
    [skip],
  );
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    view.onKeyDown(event);
    if (event.defaultPrevented) skip();
  };

  return (
    <RevealProvider controller={reveal.controller}>
      <div
        className={`editor-canvas preview-canvas${view.opened ? "" : " canvas--opening"}`}
        data-reveal-status={reveal.status}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="region"
        aria-label="Diagram preview. Arrow keys pan, plus and minus zoom, 0 returns to the opening view."
      >
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          // Every port is a "source" handle; connectors attach to them in loose mode, as in the editor.
          connectionMode={ConnectionMode.Loose}
          {...view.flow}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          zIndexMode="manual"
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={false}
          onMoveStart={onMoveStart}
          onPaneClick={skip}
          onNodeClick={skip}
          onEdgeClick={skip}
          minZoom={0.1}
          maxZoom={2}
          aria-label="Diagram"
        >
          {view.minimap && <MiniMap pannable zoomable ariaLabel="Minimap" />}
        </ReactFlow>
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
        >
          <RevealControls reveal={reveal} />
        </ViewFooter>
      </div>
    </RevealProvider>
  );
}
