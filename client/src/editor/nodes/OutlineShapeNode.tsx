import { useMemo } from "react";
import { boxStyle, dashArray, shapeOf } from "../../document/nodeData";
import { cssPolygon, shapePaths, sideAnchors, wrapGuides } from "../../geometry/shapes";
import { nodeFrame, type NodeBodyProps } from "./nodeFrame";
import { NodeShell } from "./NodeShell";
import { InlineTextEditor } from "./InlineTextEditor";

// Decision diamonds and the shape library. The outline, the handle anchors
// and the text-wrap guides all come from the same vertex list, so they agree
// at every size and redraw live while resizing.

const DEFAULT_STROKE = 1.5;

function ShapeNodeView({ node, selected }: NodeBodyProps) {
  const kind = shapeOf(node) ?? "hexagon";
  const { width, height } = node.size;
  const style = boxStyle(node);
  const strokeWidth = style.borderWidth ?? DEFAULT_STROKE;
  const paths = useMemo(() => shapePaths(kind, width, height, strokeWidth), [kind, width, height, strokeWidth]);
  const guides = useMemo(() => wrapGuides(kind, width, height), [kind, width, height]);
  const anchors = useMemo(() => sideAnchors(kind, width, height), [kind, width, height]);

  return (
    <NodeShell node={node} selected={selected} anchors={anchors} className={`node--shape-${kind}`}>
      <svg
        className="node-shape"
        width={width}
        height={height}
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        aria-hidden="true"
      >
        <path
          className="node-shape__outline"
          d={paths.outline}
          style={{
            strokeWidth,
            ...(style.fill ? { fill: style.fill } : {}),
            ...(style.stroke ? { stroke: style.stroke } : {}),
            strokeDasharray: style.borderStyle ? dashArray(style.borderStyle, strokeWidth) : undefined,
          }}
        />
        {paths.detail && (
          <path
            className="node-shape__detail"
            d={paths.detail}
            style={{ strokeWidth, ...(style.stroke ? { stroke: style.stroke } : {}) }}
          />
        )}
      </svg>
      <InlineTextEditor
        node={node}
        chrome={0}
        layout="shape"
        clip={paths.outline}
        guides={
          guides && (
            <>
              <span
                className="wrap-guide wrap-guide--left"
                style={{ width: width / 2, height, shapeOutside: cssPolygon(guides.left) }}
              />
              <span
                className="wrap-guide wrap-guide--right"
                style={{ width: width / 2, height, shapeOutside: cssPolygon(guides.right) }}
              />
            </>
          )
        }
      />
    </NodeShell>
  );
}

export const OutlineShapeNode = nodeFrame(ShapeNodeView);
