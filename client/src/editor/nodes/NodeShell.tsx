import { useRef, type ReactNode } from "react";
import { Handle, NodeResizer, Position, useKeyPress } from "@xyflow/react";
import { boxStyle } from "../../document/nodeData";
import { KIND_TRAITS } from "../../document/nodeKinds";
import { SIDES, type DiagramNode, type Side } from "../../document/types";
import type { SideAnchors } from "../../geometry/shapes";
import { MAX_NODE_SIZE } from "../../geometry/sizing";
import { useNodeFade, useNodePhase } from "../../preview/reveal";
import { countRender } from "../../perf/renderCounts";
import { useEditor } from "../EditorStoreContext";

// The shared node anatomy. Every body is wrapped in a shell that adds the
// overlays as siblings of the body: resize handles (selected nodes only),
// the four connection handles, and the data attributes tests and styles use.
// A new node kind plugs in by supplying only its body.

const POSITIONS: Readonly<Record<Side, Position>> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/**
 * Four handles, one per side, each usable as a start or an end (loose
 * connection mode). `outward` moves them clear of the drop zone while connecting.
 */
export function ConnectionPorts({
  anchors,
  hidden = false,
  outward = false,
}: {
  anchors?: SideAnchors | undefined;
  hidden?: boolean;
  outward?: boolean;
}) {
  return (
    <>
      {SIDES.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={POSITIONS[side]}
          isConnectable={!hidden}
          className={["node-handle", hidden ? "node-handle--hidden" : "", outward ? "node-handle--outward" : ""]
            .filter(Boolean)
            .join(" ")}
          style={anchors ? { left: anchors[side].x, top: anchors[side].y } : undefined}
        />
      ))}
    </>
  );
}

function ShellResizer({ node }: { node: DiagramNode }) {
  // Shift locks the aspect ratio while dragging a handle; only selected nodes listen.
  const shift = useKeyPress("Shift");
  const { minSize } = KIND_TRAITS[node.kind];
  return (
    <NodeResizer
      minWidth={minSize.width}
      minHeight={minSize.height}
      maxWidth={MAX_NODE_SIZE}
      maxHeight={MAX_NODE_SIZE}
      keepAspectRatio={shift || boxStyle(node).keepAspectRatio}
      handleClassName="node-resize-handle"
      lineClassName="node-resize-line"
    />
  );
}

interface NodeShellProps {
  readonly node: DiagramNode;
  readonly selected: boolean;
  readonly children: ReactNode;
  readonly anchors?: SideAnchors | undefined;
  /** Hides the connection handles (for example a group while one of its children starts a connection). */
  readonly handlesHidden?: boolean;
  readonly className?: string;
}

export function NodeShell({
  node,
  selected,
  children,
  anchors,
  handlesHidden = false,
  className = "",
}: NodeShellProps) {
  countRender("content", node.id);
  const canEdit = useEditor((state) => state.canEdit);
  const editing = useEditor((state) => state.editingNodeId === node.id);
  // While a connection is dragged, every other step shows its drop zone.
  const dropZone = useEditor((state) => state.connection !== null && state.connection.sources[0] !== node.id);
  // A search result is highlighted for a moment; the key restarts the animation when the same node is found again.
  const pulse = useEditor((state) => (state.pulse?.id === node.id ? state.pulse.seq : 0));
  const { connectable } = KIND_TRAITS[node.kind];
  // The reveal animation (preview only) hides the body until its turn, then fades it in.
  const phase = useNodePhase(node.id);
  const body = useRef<HTMLDivElement>(null);
  useNodeFade(body, phase);
  return (
    <>
      {canEdit && selected && !editing && <ShellResizer node={node} />}
      {/* Ports are always present for connectable kinds (the canvas library attaches edges to them); viewers cannot use them. */}
      {connectable && <ConnectionPorts anchors={anchors} hidden={handlesHidden || !canEdit} outward={dropZone} />}
      {canEdit && connectable && dropZone && (
        <div className="node-drop-zone" data-testid="drop-zone" aria-hidden="true" />
      )}
      {pulse > 0 && <div key={pulse} className="node-pulse" data-testid="node-pulse" aria-hidden="true" />}
      <div
        ref={body}
        className={`node node--${node.kind} ${className}`.trim()}
        data-node-kind={node.kind}
        data-reveal={phase}
        data-parent-id={node.parentId ?? ""}
        data-z={node.z}
        data-editing={editing ? "true" : undefined}
      >
        {children}
      </div>
    </>
  );
}
