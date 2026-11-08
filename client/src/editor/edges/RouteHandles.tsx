import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useReactFlow, useStore, useStoreApi } from "@xyflow/react";
import type { RoutePoint } from "../../document/types";
import type { Vec } from "../../geometry/vector";
import {
  arrowOffset,
  insertPoint,
  movePoint,
  removePoint,
  routeHandles,
  snapToAnchors,
  type RouteHandle,
  type Snap,
} from "../../routing/pointEdit";
import { autoRoute, sameXY, segmentHandles, simplifyVertices, type OrthogonalEnd } from "../../routing/orthogonal";
import {
  dragSegment,
  finishSegmentDrag,
  nudgeSegment,
  removeSegmentEdit,
  startSegmentDrag,
  toStored,
  type SegmentDrag,
  type Vertex,
} from "../../routing/stepEdit";
import { createFrameScheduler } from "../frameScheduler";
import { useHandleDrag } from "./useHandleDrag";

// On-canvas editing of a selected connector's route. Free routes show their
// points (filled, in the connector's colour) and an "add point" handle on
// every piece (hollow, accent outline); orthogonal routes show one handle per
// movable segment. Handles keep a constant 6 px screen radius, are in the
// tab order, and carry the canvas library's "nodrag nopan nokey" classes so
// dragging or typing on them never pans the canvas, drags a step or deletes
// the connector.
//
// A drag keeps its draft in the connector (redrawn at most once per frame)
// and commits once on release.

export const HANDLE_RADIUS = 6;

const zoomOf = (state: { transform: readonly [number, number, number] }) => state.transform[2];

/** Focuses another handle of the same connector after a removal, or the connector itself. */
function focusAfterRemoval(from: Element, handleId: string | null, edgeId: string) {
  const group = from.closest(".react-flow__edge");
  const next = handleId ? group?.querySelector<SVGElement>(`[data-handle-id="${handleId}"]`) : null;
  window.requestAnimationFrame(() => {
    const target = next ?? document.querySelector<SVGElement>(`.react-flow__edge[data-id="${edgeId}"]`) ?? group;
    if (target instanceof SVGElement || target instanceof HTMLElement) target.focus();
  });
}

export interface PointHandlesProps {
  readonly edgeId: string;
  readonly points: readonly RoutePoint[];
  readonly addPositions: readonly Vec[];
  /** The source and target anchors, the snapping references. */
  readonly anchors: readonly [Vec, Vec];
  readonly onDraft: (points: readonly RoutePoint[] | null, snap: Snap | null) => void;
  readonly onCommit: (points: readonly RoutePoint[]) => void;
}

interface PointDrag {
  readonly id: string;
  points: readonly RoutePoint[];
  snap: Snap | null;
}

export function PointHandles({ edgeId, points, addPositions, anchors, onDraft, onCommit }: PointHandlesProps) {
  const zoom = useStore(zoomOf);
  const flow = useStoreApi();
  const { screenToFlowPosition } = useReactFlow();
  const handles = useMemo(() => routeHandles(points, addPositions), [points, addPositions]);
  const [scheduler] = useState(() =>
    createFrameScheduler<{ points: readonly RoutePoint[]; snap: Snap | null }>((draft) => {
      onDraft(draft.points, draft.snap);
    }),
  );

  const drag = useHandleDrag<PointDrag>({
    start: (event) => {
      const handle = handles.find((entry) => entry.id === (event.currentTarget as SVGElement).dataset.handleId);
      if (!handle) return null;
      const start = handle.kind === "add" ? insertPoint(points, handle.insertAt, handle.id, handle.position) : points;
      scheduler.schedule({ points: start, snap: null });
      return { id: handle.id, points: start, snap: null };
    },
    move: (session, client) => {
      const snap = snapToAnchors(screenToFlowPosition(client), anchors, flow.getState().transform[2]);
      session.points = movePoint(session.points, session.id, snap.point);
      session.snap = snap.guideX === null && snap.guideY === null ? null : snap;
      scheduler.schedule({ points: session.points, snap: session.snap });
    },
    end: (session) => {
      scheduler.cancel();
      onDraft(null, null);
      onCommit(session.points);
    },
  });

  const remove = (target: Element, handle: RouteHandle) => {
    const { points: rest, focus } = removePoint(points, handle.id);
    onCommit(rest);
    focusAfterRemoval(target, focus, edgeId);
  };

  const onKeyDown = (handle: RouteHandle) => (event: KeyboardEvent<SVGCircleElement>) => {
    if (handle.kind === "add" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onCommit(insertPoint(points, handle.insertAt, handle.id, handle.position));
      return;
    }
    if (handle.kind !== "point") return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(event.currentTarget, handle);
      return;
    }
    const offset = arrowOffset(event.key, event.altKey);
    if (offset) {
      event.preventDefault();
      onCommit(movePoint(points, handle.id, { x: handle.position.x + offset.x, y: handle.position.y + offset.y }));
    }
  };

  const onContextMenu = (handle: RouteHandle) => (event: MouseEvent<SVGCircleElement>) => {
    event.preventDefault();
    if (handle.kind === "point") remove(event.currentTarget, handle);
  };

  const radius = HANDLE_RADIUS / zoom;
  return (
    <g className="route-handles">
      {handles.map((handle, index) => (
        <circle
          key={handle.id}
          data-handle-id={handle.id}
          data-testid={handle.kind === "add" ? "route-add-handle" : "route-point"}
          className={`route-handle route-handle--${handle.kind} nodrag nopan nokey`}
          cx={handle.position.x}
          cy={handle.position.y}
          r={radius}
          strokeWidth={1.5 / zoom}
          tabIndex={0}
          role="button"
          aria-label={
            handle.kind === "add"
              ? `Add a route point (${String(index / 2 + 1)})`
              : `Route point ${String(handle.index + 1)}: arrows move it, Delete removes it`
          }
          onKeyDown={onKeyDown(handle)}
          onContextMenu={onContextMenu(handle)}
          {...drag}
        />
      ))}
    </g>
  );
}

export interface SegmentHandlesProps {
  readonly vertices: readonly Vertex[];
  readonly source: OrthogonalEnd;
  readonly target: OrthogonalEnd;
  readonly onDraft: (vertices: readonly Vertex[] | null) => void;
  readonly onCommit: (points: readonly RoutePoint[]) => void;
}

interface SegmentSession {
  readonly drag: SegmentDrag;
  /** The stored form of the route when the drag started (the props show the draft meanwhile). */
  readonly before: readonly RoutePoint[];
  vertices: readonly Vertex[] | null;
}

const SEGMENT_KEYS: Readonly<Record<"x" | "y", Readonly<Record<string, number>>>> = {
  x: { ArrowLeft: -1, ArrowRight: 1 },
  y: { ArrowUp: -1, ArrowDown: 1 },
};

export function SegmentHandles({ vertices, source, target, onDraft, onCommit }: SegmentHandlesProps) {
  const zoom = useStore(zoomOf);
  const { screenToFlowPosition } = useReactFlow();
  const handles = useMemo(() => segmentHandles(vertices), [vertices]);
  const [scheduler] = useState(() => createFrameScheduler<readonly Vertex[]>(onDraft));

  const drag = useHandleDrag<SegmentSession>({
    start: (event) => {
      const index = Number((event.currentTarget as SVGElement).dataset.segment);
      if (!Number.isInteger(index)) return null;
      return { drag: startSegmentDrag(vertices, index), before: toStored(simplifyVertices(vertices)), vertices: null };
    },
    move: (session, client) => {
      const pointer = screenToFlowPosition(client);
      session.vertices = dragSegment(session.drag, pointer[session.drag.axis]);
      scheduler.schedule(session.vertices);
    },
    end: (session) => {
      scheduler.cancel();
      onDraft(null);
      if (!session.vertices) return;
      const next = finishSegmentDrag(session.vertices);
      // A press without movement changes nothing and stores nothing.
      const { before } = session;
      if (next.length !== before.length || next.some((point, index) => !sameXY(point, before[index] ?? point)))
        onCommit(next);
    },
  });

  const onKeyDown = (index: number, axis: "x" | "y") => (event: KeyboardEvent<SVGCircleElement>) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onCommit(removeSegmentEdit(vertices, index, autoRoute(source, target)));
      return;
    }
    const direction = SEGMENT_KEYS[axis][event.key];
    if (direction === undefined) return;
    event.preventDefault();
    onCommit(nudgeSegment(vertices, index, direction * (event.altKey ? 1 : 5)));
  };

  const onContextMenu = (index: number) => (event: MouseEvent<SVGCircleElement>) => {
    event.preventDefault();
    onCommit(removeSegmentEdit(vertices, index, autoRoute(source, target)));
  };

  const radius = HANDLE_RADIUS / zoom;
  return (
    <g className="route-handles">
      {handles.map((handle) => (
        <circle
          key={handle.index}
          data-segment={handle.index}
          data-axis={handle.axis}
          data-testid="segment-handle"
          className={`route-handle route-handle--segment route-handle--${handle.axis === "x" ? "ew" : "ns"} nodrag nopan nokey`}
          cx={handle.position.x}
          cy={handle.position.y}
          r={radius}
          strokeWidth={1.5 / zoom}
          tabIndex={0}
          role="button"
          aria-label={
            `Segment ${String(handle.index)}: drag or use the ${handle.axis === "x" ? "left and right" : "up and down"} ` +
            "arrows to move it, Delete removes the edit"
          }
          onKeyDown={onKeyDown(handle.index, handle.axis)}
          onContextMenu={onContextMenu(handle.index)}
          {...drag}
        />
      ))}
    </g>
  );
}
