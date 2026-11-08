import { shapeOf } from "../document/nodeData";
import { cornerRadius } from "../document/nodeKinds";
import type { DiagramNode, Size } from "../document/types";
import type { Outline } from "../geometry/outline";
import { outlinePolygon, sideAnchors } from "../geometry/shapes";
import type { PortOffsets } from "./anchors";

// The true outline and the port positions of a node, for anchoring
// connectors on the shape rather than on its bounding box.

export function outlineOf(node: DiagramNode, size: Size): Outline {
  switch (node.kind) {
    case "decision":
      return { kind: "diamond" };
    case "shape": {
      const shape = shapeOf(node) ?? "hexagon";
      if (shape === "diamond") return { kind: "diamond" };
      if (shape === "circle") return { kind: "ellipse" };
      return { kind: "polygon", points: outlinePolygon(shape, size.width, size.height) };
    }
    case "step":
    case "start-end":
    case "group":
      return { kind: "rounded", radius: cornerRadius(node.kind, size.height) };
    default:
      return { kind: "rect" };
  }
}

/** Ports for outlines that do not touch every side midpoint (shapes and decisions); undefined means the side midpoints. */
export function portOffsetsOf(node: DiagramNode, size: Size): PortOffsets | undefined {
  if (node.kind === "decision") return sideAnchors("diamond", size.width, size.height);
  if (node.kind === "shape") return sideAnchors(shapeOf(node) ?? "hexagon", size.width, size.height);
  return undefined;
}
