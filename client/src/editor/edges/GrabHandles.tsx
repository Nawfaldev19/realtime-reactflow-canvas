import { useState } from "react";
import { useReactFlow, useStoreApi } from "@xyflow/react";
import { distance, type Vec } from "../../geometry/vector";
import { NORMALS } from "../../routing/anchors";
import type { RouteEnd } from "../../routing/route";
import { useEditorStoreApi } from "../EditorStoreContext";
import { createFrameScheduler } from "../frameScheduler";
import type { CanvasNode } from "../flowAdapter";
import type { EdgeEnd } from "../store";
import { endTargetAt } from "./hits";
import { useHandleDrag } from "./useHandleDrag";

// Reconnecting: a small round grab handle sits 10 units outside each end,
// along the end's side normal, drawn inside the connector itself. Dragging
// it to another step re-attaches that end (to a port near the pointer, or
// with automatic sides anywhere in the step's drop zone). Releasing on empty
// canvas cancels and the connector snaps back.

export const GRAB_OFFSET = 10;
const GRAB_RADIUS = 5;
/** Screen pixels the pointer must travel before a press on a grab handle becomes a reconnect. */
const MOVE_THRESHOLD = 3;

export interface GrabHandlesProps {
  readonly edgeId: string;
  readonly source: RouteEnd;
  readonly target: RouteEnd;
  readonly sourceId: string;
  readonly targetId: string;
  /** Moves one end to the pointer while dragging, or back (null). */
  readonly onOverride: (override: { end: EdgeEnd; point: Vec } | null) => void;
}

const grabPoint = (end: RouteEnd): Vec => ({
  x: end.point.x + NORMALS[end.side].x * GRAB_OFFSET,
  y: end.point.y + NORMALS[end.side].y * GRAB_OFFSET,
});

export function GrabHandles({ edgeId, source, target, sourceId, targetId, onOverride }: GrabHandlesProps) {
  const api = useEditorStoreApi();
  const flow = useStoreApi<CanvasNode>();
  const { screenToFlowPosition } = useReactFlow();
  const [scheduler] = useState(() => createFrameScheduler<{ end: EdgeEnd; point: Vec }>(onOverride));

  const drag = useHandleDrag<{ end: EdgeEnd; start: Vec; point: Vec | null }>({
    start: (event) => {
      const end = (event.currentTarget as SVGElement).dataset.end;
      return end === "source" || end === "target"
        ? { end, start: { x: event.clientX, y: event.clientY }, point: null }
        : null;
    },
    move: (session, client) => {
      // A press that has not moved yet is not a reconnect.
      if (!session.point && distance(session.start, client) < MOVE_THRESHOLD) return;
      session.point = screenToFlowPosition(client);
      scheduler.schedule({ end: session.end, point: session.point });
    },
    end: (session) => {
      scheduler.cancel();
      onOverride(null);
      if (!session.point) return;
      const { nodeLookup, transform } = flow.getState();
      const fixed = session.end === "source" ? targetId : sourceId;
      const landing = endTargetAt(nodeLookup, session.point, transform[2], new Set([fixed]));
      if (landing) api.getState().reconnect(edgeId, session.end, landing.nodeId, landing.side);
    },
  });

  return (
    <g className="connector-grabs">
      {(["source", "target"] as const).map((end) => {
        const point = grabPoint(end === "source" ? source : target);
        return (
          <circle
            key={end}
            data-end={end}
            data-testid={`grab-${end}`}
            className="connector-grab nodrag nopan"
            cx={point.x}
            cy={point.y}
            r={GRAB_RADIUS}
            // A pointer-only shortcut: the same change is available by deleting and redrawing the connector.
            aria-hidden="true"
            {...drag}
          />
        );
      })}
    </g>
  );
}
