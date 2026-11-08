import { useLayoutEffect, useMemo, useRef } from "react";
import { Position, useInternalNode, type InternalNode } from "@xyflow/react";
import type { DiagramEdge, RoutePoint, Side } from "../../document/types";
import { measurePath, pathData, type PathMeasure } from "../../geometry/path";
import type { Box, Vec } from "../../geometry/vector";
import { closestSides } from "../../routing/anchors";
import { roundedPath } from "../../routing/orthogonal";
import { computeRoute, type RouteEnd, type RouteGeometry } from "../../routing/route";
import type { Vertex } from "../../routing/stepEdit";
import { connectorEnds, type ConnectorEnds, type EndpointBox } from "../connectorGeometry";
import type { CanvasNode } from "../flowAdapter";
import type { EdgeEnd } from "../store";

// The geometry of one connector, recomputed only when its inputs change:
// the two steps' live boxes (they follow a drag before it is committed),
// the sides, the route style and the points. The ends drawn last time give
// automatic sides their hysteresis and floating ends their overlap fallback.

/** The canvas library's own handle positions, used until both steps have been measured. */
export interface FallbackEnds {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly sourcePosition: Position;
  readonly targetPosition: Position;
}

const SIDE_OF: Readonly<Record<Position, Side>> = {
  [Position.Top]: "top",
  [Position.Right]: "right",
  [Position.Bottom]: "bottom",
  [Position.Left]: "left",
};

function endpointOf(internal: InternalNode<CanvasNode> | undefined): EndpointBox | null {
  if (!internal) return null;
  const width = internal.measured.width ?? internal.width;
  const height = internal.measured.height ?? internal.height;
  if (!width || !height) return null;
  const { x, y } = internal.internals.positionAbsolute;
  return { node: internal.data.node, box: { x, y, width, height } };
}

const sameBox = (a: Box | undefined, b: Box | undefined) =>
  a?.x === b?.x && a?.y === b?.y && a?.width === b?.width && a?.height === b?.height;

/** Keeps the previous endpoint object while its box and node are unchanged, so memos downstream hold. */
function useStableEndpoint(internal: InternalNode<CanvasNode> | undefined): EndpointBox | null {
  const next = endpointOf(internal);
  const previous = useRef<EndpointBox | null>(null);
  const stable =
    previous.current && next && previous.current.node === next.node && sameBox(previous.current.box, next.box)
      ? previous.current
      : next;
  useLayoutEffect(() => {
    previous.current = stable;
  });
  return stable;
}

/** An end following the pointer (while reconnecting or previewing): it enters from the side facing the other end. */
export function pointerEnd(point: Vec, other: RouteEnd): RouteEnd {
  const box = other.box ?? { x: other.point.x, y: other.point.y, width: 0, height: 0 };
  const sides = closestSides({ source: box, target: { x: point.x, y: point.y, width: 0, height: 0 } });
  return { point, side: sides.target, box: null };
}

export interface ConnectorGeometryInput {
  readonly edge: DiagramEdge;
  readonly points: readonly RoutePoint[];
  readonly fallback: FallbackEnds;
  /** One end follows the pointer (reconnecting). */
  readonly override?: { readonly end: EdgeEnd; readonly point: Vec } | null | undefined;
  /** A step route being dragged: drawn as given. */
  readonly vertices?: readonly Vertex[] | null | undefined;
}

export interface ConnectorGeometry {
  readonly ends: ConnectorEnds;
  readonly route: RouteGeometry;
  readonly measure: PathMeasure;
  readonly d: string;
}

export function useConnectorGeometry({
  edge,
  points,
  fallback,
  override = null,
  vertices = null,
}: ConnectorGeometryInput): ConnectorGeometry {
  const source = useStableEndpoint(useInternalNode<CanvasNode>(edge.source));
  const target = useStableEndpoint(useInternalNode<CanvasNode>(edge.target));
  const previousEnds = useRef<ConnectorEnds | null>(null);
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = fallback;

  const ends = useMemo((): ConnectorEnds => {
    let result: ConnectorEnds;
    if (source && target) {
      result = connectorEnds(edge, source, target, previousEnds.current);
    } else {
      const sides = { source: SIDE_OF[sourcePosition], target: SIDE_OF[targetPosition] };
      result = {
        source: { point: { x: sourceX, y: sourceY }, side: sides.source, box: null },
        target: { point: { x: targetX, y: targetY }, side: sides.target, box: null },
        sides,
      };
    }
    if (!override) return result;
    // The side is the face of the pointer's zero-size box that looks at the fixed end, whichever end moves.
    if (override.end === "source") {
      const moved = pointerEnd(override.point, result.target);
      return { ...result, source: moved, sides: { ...result.sides, source: moved.side } };
    }
    const moved = pointerEnd(override.point, result.source);
    return { ...result, target: moved, sides: { ...result.sides, target: moved.side } };
  }, [edge, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, override]);

  useLayoutEffect(() => {
    if (!override) previousEnds.current = ends;
  });

  const route = useMemo((): RouteGeometry => {
    if (vertices) return { path: roundedPath(vertices), vertices, addHandles: [], labelAnchor: null };
    if (edge.kind === "floating") {
      return {
        path: [{ kind: "line", from: ends.source.point, to: ends.target.point }],
        vertices: null,
        addHandles: [],
        labelAnchor: null,
      };
    }
    return computeRoute({ style: edge.route.style, source: ends.source, target: ends.target, points });
  }, [edge.kind, edge.route.style, ends, points, vertices]);

  const measure = useMemo(() => measurePath(route.path), [route.path]);
  const d = useMemo(() => pathData(route.path), [route.path]);
  return { ends, route, measure, d };
}
