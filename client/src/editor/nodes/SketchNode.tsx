import { useMemo } from "react";
import { sketchProps } from "../../document/nodeData";
import { DEFAULT_STROKE, outlineToPath, scaleStroke, strokeOutline } from "../../geometry/freehand";
import { nodeFrame, type NodeBodyProps } from "./nodeFrame";
import { NodeShell } from "./NodeShell";

// Freehand ink. The stored samples are scaled from the box size they were
// drawn in to the current box, then the outline is rebuilt at the stored
// stroke size, so resizing stretches the stroke without thickening it. Only
// the ink takes the pointer: clicking the empty part of the box selects
// nothing.

function SketchNodeView({ node, selected }: NodeBodyProps) {
  // Parsed once per node object (dragging keeps it), so the outline below is memoized per (points, size).
  const { points, initialSize, color, strokeSize } = useMemo(() => sketchProps(node), [node]);
  const { width, height } = node.size;
  const path = useMemo(
    () =>
      outlineToPath(
        strokeOutline(scaleStroke(points, initialSize, { width, height }), { ...DEFAULT_STROKE, size: strokeSize }),
      ),
    [points, initialSize, width, height, strokeSize],
  );
  return (
    <NodeShell node={node} selected={selected}>
      <svg className="sketch-node" width={width} height={height} aria-hidden="true">
        <path className="sketch-node__ink" d={path} style={color ? { fill: color } : undefined} />
      </svg>
    </NodeShell>
  );
}

export const SketchNode = nodeFrame(SketchNodeView);
