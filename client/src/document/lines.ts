import { nearestOf } from "../geometry/angles";
import { resizeLine, rotateLine, type LineGeometry } from "../geometry/line";
import type { Box } from "../geometry/vector";
import { lineProps } from "./nodeData";
import type { NodeFields } from "./operations";
import type { DiagramNode } from "./types";

// Every way of rotating a line (the handle, the panel slider and number
// field, the ±45° and ±5° buttons, the snap commands) goes through
// lineRotationFields, so they all produce the same box for the same angle.

const boxOf = (node: DiagramNode): Box => ({ ...node.position, ...node.size });

function fieldsFor(geometry: LineGeometry): NodeFields {
  const { box, rotation, length } = geometry;
  return {
    position: { x: box.x, y: box.y },
    size: { width: box.width, height: box.height },
    data: { rotation, length },
  };
}

/** The fields that rotate a line node to `angle` about its centre, keeping its stored length. */
export function lineRotationFields(node: DiagramNode, angle: number): NodeFields {
  return fieldsFor(rotateLine(boxOf(node), lineProps(node).length, angle));
}

export function rotateLineBy(node: DiagramNode, delta: number): NodeFields {
  return lineRotationFields(node, lineProps(node).rotation + delta);
}

export type SnapDirection = "vertical" | "horizontal";

/** Vertical is the nearer of 0° and 180°; horizontal the nearer of 90° and 270°. */
export function snapLine(node: DiagramNode, to: SnapDirection): NodeFields {
  const { rotation } = lineProps(node);
  return lineRotationFields(node, nearestOf(rotation, to === "vertical" ? [0, 180] : [90, 270]));
}

/** After a resize the line spans the new box at its angle; the stored length follows. */
export function lineResizeFields(node: DiagramNode, box: Box): NodeFields {
  return fieldsFor(resizeLine(box, lineProps(node).rotation));
}
