import { memo, type ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";
import type { DiagramNode } from "../../document/types";
import { perfFlags } from "../../perf/flags";
import { countRender } from "../../perf/renderCounts";
import type { CanvasNode } from "../flowAdapter";

// The node frame: the component the canvas library renders for a node. The
// library re-renders it whenever the node's wrapper changes, which includes
// every frame of a drag (its props carry the absolute position). The frame
// only unpacks the props; the body (shell anatomy, outline, text editor) is a
// separate memoized component that depends on the stored node object and the
// selection flag alone. Dragging keeps the stored node object until release,
// so a drag frame costs one tiny frame render and no body render.

export interface NodeBodyProps {
  readonly id: string;
  /** The stored node, with any live gesture fields merged in. */
  readonly node: DiagramNode;
  readonly selected: boolean;
}

/** Wraps a node body for the canvas library; `memoize` is the `no-memo` debug switch. */
export function nodeFrame(
  Body: ComponentType<NodeBodyProps>,
  memoize = perfFlags.memo,
): ComponentType<NodeProps<CanvasNode>> {
  const Content = memoize ? memo(Body) : Body;
  function NodeFrame({ id, data, selected }: NodeProps<CanvasNode>) {
    countRender("frame", id);
    return <Content id={id} node={data.node} selected={selected} />;
  }
  NodeFrame.displayName = `NodeFrame(${Body.displayName ?? Body.name})`;
  return NodeFrame;
}
