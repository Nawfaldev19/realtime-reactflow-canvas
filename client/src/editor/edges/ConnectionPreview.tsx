import { useMemo } from "react";
import { useStore, type ConnectionLineComponentProps, type InternalNode } from "@xyflow/react";
import { SIDES, type RoutePoint, type Side } from "../../document/types";
import { floatingAnchor } from "../../geometry/outline";
import { pathData } from "../../geometry/path";
import type { Vec } from "../../geometry/vector";
import { portPoint } from "../../routing/anchors";
import { dropTargetAt } from "../../routing/connect";
import { outlineOf, portOffsetsOf } from "../../routing/nodeGeometry";
import { computeRoute, type RouteEnd } from "../../routing/route";
import { connectorEnds, sketchPoints, type EndpointBox } from "../connectorGeometry";
import { useEditor } from "../EditorStoreContext";
import type { CanvasNode } from "../flowAdapter";
import { nodeHits } from "./hits";
import { pointerEnd } from "./useConnectorGeometry";

// The line drawn while a connection is dragged. It runs the same route
// function as the finished connector, in the page's default style, through
// any sketched points, so what you see is what you get. With a
// multi-selection a line is drawn from the same port of every selected step.

const sideOf = (id: string | null | undefined): Side | null => (SIDES.includes(id as Side) ? (id as Side) : null);

function endpointOf(internal: InternalNode<CanvasNode> | undefined): EndpointBox | null {
  if (!internal) return null;
  const width = internal.measured.width ?? internal.width ?? 0;
  const height = internal.measured.height ?? internal.height ?? 0;
  return { node: internal.data.node, box: { ...internal.internals.positionAbsolute, width, height } };
}

const sketchRoutePoints = (sketch: readonly Vec[]): RoutePoint[] =>
  sketch.map((point, index) => ({ id: `sketch-${String(index)}`, x: point.x, y: point.y }));

export function ConnectionPreview({
  fromNode,
  fromHandle,
  toX,
  toY,
  toNode,
  toHandle,
  connectionStatus,
}: ConnectionLineComponentProps<CanvasNode>) {
  const connection = useEditor((state) => state.connection);
  const defaults = useEditor((state) => state.connectorDefaults);
  // Our nodes always carry CanvasNodeData; the library's hook is typed with its base node.
  const lookup = useStore((state) => state.nodeLookup) as unknown as ReadonlyMap<string, InternalNode<CanvasNode>>;
  const sources = connection?.sources;
  const side = connection?.side ?? sideOf(fromHandle.id) ?? "bottom";
  const sketch = connection?.sketch;

  const paths = useMemo(() => {
    const pointer = { x: toX, y: toY };
    const zoned = toNode ? null : dropTargetAt(nodeHits(lookup), pointer, new Set([fromNode.id]));
    const targetNode = toNode ?? (zoned ? lookup.get(zoned) : undefined);
    const target = endpointOf(targetNode);
    const targetSide = toNode ? sideOf(toHandle?.id) : null;
    return (sources ?? [fromNode.id]).flatMap((sourceId, index) => {
      const source = endpointOf(lookup.get(sourceId));
      if (!source || sourceId === target?.node.id) return [];
      if (defaults.kind === "floating") {
        const towards = target
          ? { x: target.box.x + target.box.width / 2, y: target.box.y + target.box.height / 2 }
          : pointer;
        const from = floatingAnchor(source.box, outlineOf(source.node, source.box), towards);
        const to = target
          ? floatingAnchor(target.box, outlineOf(target.node, target.box), {
              x: source.box.x + source.box.width / 2,
              y: source.box.y + source.box.height / 2,
            })
          : pointer;
        return [{ id: sourceId, d: pathData([{ kind: "line", from, to }]) }];
      }
      let start: RouteEnd;
      let end: RouteEnd;
      if (target) {
        const ends = connectorEnds({ kind: "connector", sourceSide: side, targetSide }, source, target);
        start = ends.source;
        end = toNode && toHandle ? { ...ends.target, point: pointer } : ends.target;
      } else {
        start = { point: portPoint(source.box, side, portOffsetsOf(source.node, source.box)), side, box: source.box };
        end = pointerEnd(pointer, start);
      }
      const points =
        index === 0 && sketch && sketch.length > 0
          ? defaults.style === "step"
            ? sketchPoints(
                "step",
                { source: start, target: end, sides: { source: start.side, target: end.side } },
                sketch,
              )
            : sketchRoutePoints(sketch)
          : [];
      return [
        { id: sourceId, d: pathData(computeRoute({ style: defaults.style, source: start, target: end, points }).path) },
      ];
    });
  }, [toX, toY, toNode, toHandle, lookup, fromNode.id, sources, side, sketch, defaults]);

  return (
    <g
      className={`connection-preview connection-preview--${connectionStatus ?? "pending"}`}
      data-testid="connection-preview"
    >
      {paths.map((entry) => (
        <path key={entry.id} className="connection-preview__line" d={entry.d} />
      ))}
      {sketch?.map((point, index) => (
        <circle key={index} className="connection-preview__point" cx={point.x} cy={point.y} r={3} />
      ))}
    </g>
  );
}
