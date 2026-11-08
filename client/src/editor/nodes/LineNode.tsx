import { useCallback } from "react";
import { useReactFlow, useStoreApi } from "@xyflow/react";
import { dashArray, lineProps } from "../../document/nodeData";
import { direction, HANDLE_HIT_RADIUS, HANDLE_RADIUS, handlePoint, lineEndpoints, stemEnd } from "../../geometry/line";
import type { Vec } from "../../geometry/vector";
import { useEditor } from "../EditorStoreContext";
import { nodeFrame, type NodeBodyProps } from "./nodeFrame";
import { NodeShell } from "./NodeShell";
import { useRotationHandle } from "./useRotationHandle";

// A free straight line, drawn through the centre of its box and clipped to
// it. Only the stroke (with a wider invisible hit area) takes the pointer, so
// clicking the empty part of the box does not select the line. A selected
// line shows a rotate handle on the perpendicular through its midpoint.

const HIT_WIDTH = 12;

function LineNodeView({ id, node, selected }: NodeBodyProps) {
  const canEdit = useEditor((state) => state.canEdit);
  const { screenToFlowPosition } = useReactFlow();
  const flowStore = useStoreApi();
  const absolutePosition = useCallback(
    (): Vec => flowStore.getState().nodeLookup.get(id)?.internals.positionAbsolute ?? node.position,
    [flowStore, id, node.position],
  );
  const rotation = useRotationHandle({ nodeId: id, selected, toFlow: screenToFlowPosition, absolutePosition });

  const { rotation: angle, thickness, color, lineStyle, length } = lineProps(node);
  const { width, height } = node.size;
  const segment = lineEndpoints(width, height, angle);
  const handle = handlePoint(segment);
  const stem = stemEnd(segment);
  const mid = { x: width / 2, y: height / 2 };
  const guideDirection = rotation.guide === null ? null : direction(rotation.guide);
  const showHandle = canEdit && selected;

  return (
    <NodeShell node={node} selected={selected}>
      <svg className="line-node" width={width} height={height} aria-hidden={!showHandle}>
        <line
          className="line-node__hit"
          x1={segment.start.x}
          y1={segment.start.y}
          x2={segment.end.x}
          y2={segment.end.y}
          strokeWidth={Math.max(HIT_WIDTH, thickness)}
        />
        <line
          className="line-node__stroke"
          x1={segment.start.x}
          y1={segment.start.y}
          x2={segment.end.x}
          y2={segment.end.y}
          strokeWidth={thickness}
          strokeDasharray={dashArray(lineStyle, thickness)}
          style={color ? { stroke: color } : undefined}
        />
        {guideDirection && (
          <line
            className="line-node__guide"
            data-testid="line-snap-guide"
            x1={mid.x - (guideDirection.x * length) / 2}
            y1={mid.y - (guideDirection.y * length) / 2}
            x2={mid.x + (guideDirection.x * length) / 2}
            y2={mid.y + (guideDirection.y * length) / 2}
          />
        )}
        {showHandle && (
          <g className="line-rotate nodrag nopan">
            <line className="line-rotate__stem" x1={mid.x} y1={mid.y} x2={stem.x} y2={stem.y} />
            <circle className="line-rotate__disc" cx={handle.x} cy={handle.y} r={HANDLE_RADIUS} />
            <path
              className="line-rotate__glyph"
              d={[
                `M ${String(handle.x - 4)} ${String(handle.y - 1)} a 4 4 0 1 1 1.5 4`,
                `M ${String(handle.x - 4)} ${String(handle.y - 4)} v 3 h 3`,
              ].join(" ")}
            />
            <circle
              className="line-rotate__hit"
              cx={handle.x}
              cy={handle.y}
              r={HANDLE_HIT_RADIUS}
              role="slider"
              aria-label="Rotate line"
              aria-valuemin={0}
              aria-valuemax={359}
              aria-valuenow={Math.round(angle)}
              onPointerDown={rotation.onPointerDown}
              onPointerMove={rotation.onPointerMove}
              onPointerUp={rotation.onPointerUp}
              onPointerCancel={rotation.onPointerCancel}
            >
              <title>{`Rotate (${String(Math.round(angle))}°)`}</title>
            </circle>
          </g>
        )}
      </svg>
    </NodeShell>
  );
}

export const LineNode = nodeFrame(LineNodeView);
