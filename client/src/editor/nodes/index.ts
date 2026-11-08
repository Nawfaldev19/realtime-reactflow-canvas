import type { NodeTypes } from "@xyflow/react";
import type { NodeKind } from "../../document/types";
import { BoxNode } from "./BoxNode";
import { GhostNode } from "./GhostNode";
import { GroupNode } from "./GroupNode";
import { LineNode } from "./LineNode";
import { OutlineShapeNode } from "./OutlineShapeNode";
import { SketchNode } from "./SketchNode";

/**
 * One body per kind, plus the transient ghost step of a drop on empty canvas.
 * Defined once at module level so the canvas never sees a new object.
 */
export const nodeTypes = {
  ghost: GhostNode,
  step: BoxNode,
  "start-end": BoxNode,
  note: BoxNode,
  label: BoxNode,
  decision: OutlineShapeNode,
  shape: OutlineShapeNode,
  line: LineNode,
  sketch: SketchNode,
  group: GroupNode,
} satisfies Record<NodeKind | "ghost", NodeTypes[string]>;
