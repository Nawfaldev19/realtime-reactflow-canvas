import { memo, useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import type { EdgeProps } from "@xyflow/react";
import { edgeLook, labelFraction } from "../../document/connectorData";
import type { RoutePoint } from "../../document/types";
import { marchingAnts, dashStyle } from "../../geometry/dash";
import { pointAtLength, polylineData, projectOntoPath, samplePath } from "../../geometry/path";
import { normalize, sub, type Vec } from "../../geometry/vector";
import type { Snap } from "../../routing/pointEdit";
import type { Vertex } from "../../routing/stepEdit";
import { useConnectorPhase, useLineDraw } from "../../preview/reveal";
import { countRender } from "../../perf/renderCounts";
import { useEditor, useEditorStoreApi } from "../EditorStoreContext";
import type { CanvasEdge, CanvasEdgeData } from "../flowAdapter";
import type { EdgeEnd } from "../store";
import { EdgeLabel } from "./EdgeLabel";
import { GrabHandles } from "./GrabHandles";
import { MarkerDef, markerUrl } from "./markers";
import { PointHandles, SegmentHandles } from "./RouteHandles";
import { useConnectorGeometry, type FallbackEnds } from "./useConnectorGeometry";

// The connector: one component for both edge kinds and all four route
// styles. It draws the route from the live step boxes, its markers and an
// invisible 10 px (screen) hit stroke trimmed clear of the ports, plus, when
// editable, the route handles, the reconnect grab handles and the label.
// Pointer gestures keep a local draft and commit one operation on release.

/** The hit stroke stops this far from each end, so it never covers a port. */
const HIT_TRIM = 12;

interface Draft {
  readonly points?: readonly RoutePoint[];
  readonly vertices?: readonly Vertex[];
  readonly snap?: Snap | null;
  readonly override?: { readonly end: EdgeEnd; readonly point: Vec };
  readonly labelT?: number;
}

interface ConnectorProps {
  readonly id: string;
  readonly data: CanvasEdgeData;
  readonly selected: boolean;
  readonly fallback: FallbackEnds;
}

function Connector({ id, data, selected, fallback }: ConnectorProps) {
  countRender("edge", id);
  const { edge, endpointSelected, ghost } = data;
  const api = useEditorStoreApi();
  const canEdit = useEditor((state) => state.canEdit);
  const [draft, setDraft] = useState<Draft | null>(null);
  const points = draft?.points ?? edge.route.points;
  const geometry = useConnectorGeometry({
    edge,
    points,
    fallback,
    override: draft?.override,
    vertices: draft?.vertices,
  });
  const { ends, route, measure, d } = geometry;
  const look = edgeLook(edge);
  // The reveal animation (preview only): hidden, then drawn from the source; the arrowheads wait for the line to arrive.
  const phase = useConnectorPhase(id);
  const line = useRef<SVGPathElement>(null);
  useLineDraw(line, phase);
  const arrows = phase === "shown";
  const dash = dashStyle(look.pattern, look.width);
  const ants = look.animated ? marchingAnts(dash.period) : null;

  const hitPath = useMemo(
    () => (measure.total > HIT_TRIM * 4 ? polylineData(samplePath(measure, HIT_TRIM, measure.total - HIT_TRIM)) : d),
    [measure, d],
  );

  const label = useMemo(() => {
    const at = (s: number) => pointAtLength(measure, s);
    let length = labelFraction(edge) * measure.total;
    if (draft?.labelT !== undefined) length = draft.labelT * measure.total;
    else if (edge.label?.t === undefined && route.labelAnchor)
      length = projectOntoPath(measure, route.labelAnchor).length;
    const point =
      draft?.labelT === undefined && edge.label?.t === undefined && route.labelAnchor ? route.labelAnchor : at(length);
    const tangent = normalize(sub(at(length + 1), at(length - 1)));
    return { point, normal: { x: -tangent.y, y: tangent.x } };
  }, [draft?.labelT, measure, edge, route.labelAnchor]);

  const onPointDraft = useCallback((next: readonly RoutePoint[] | null, snap: Snap | null) => {
    setDraft(next ? { points: next, snap } : null);
  }, []);
  const onSegmentDraft = useCallback((vertices: readonly Vertex[] | null) => {
    setDraft(vertices ? { vertices } : null);
  }, []);
  const onOverride = useCallback((override: { end: EdgeEnd; point: Vec } | null) => {
    setDraft(override ? { override } : null);
  }, []);
  const onSlide = useCallback((t: number | null) => {
    setDraft(t === null ? null : { labelT: t });
  }, []);
  const commitRoute = useCallback((next: readonly RoutePoint[]) => api.getState().commitRoute(id, next), [api, id]);

  const editable = canEdit && !ghost && edge.kind === "connector" && (selected || endpointSelected);
  const routeDragging = draft?.points !== undefined || draft?.vertices !== undefined;
  const startId = `connector-${id}-start`;
  const endId = `connector-${id}-end`;
  const lineStyle: CSSProperties = {
    strokeWidth: look.width,
    ...(look.color ? { color: look.color } : {}),
    ...(dash.dashArray ? { strokeDasharray: dash.dashArray } : {}),
    strokeLinecap: dash.lineCap,
    ...(ants
      ? ({ "--ants-period": String(ants.from), animationDuration: `${String(ants.durationSeconds)}s` } as CSSProperties)
      : {}),
  };
  const snap = draft?.snap;

  return (
    <>
      <g
        className={`connector${selected ? " connector--selected" : ""}${ghost ? " connector--ghost" : ""}`}
        data-testid="connector"
        data-source={edge.source}
        data-target={edge.target}
        data-reveal={phase}
        data-route-style={edge.route.style}
        data-edge-kind={edge.kind}
        style={look.color ? { color: look.color } : undefined}
      >
        <defs>
          <MarkerDef id={startId} marker={look.startMarker} size={look.markerSize} color={look.startMarkerColor} />
          <MarkerDef id={endId} marker={look.endMarker} size={look.markerSize} color={look.endMarkerColor} />
        </defs>
        <path className="connector__hit" d={hitPath} />
        <path
          ref={line}
          className={`connector__line${ants ? " connector__line--ants" : ""}`}
          d={d}
          style={lineStyle}
          markerStart={arrows ? markerUrl(startId, look.startMarker) : undefined}
          markerEnd={arrows ? markerUrl(endId, look.endMarker) : undefined}
        />
        {snap?.guideX != null && (
          <line
            className="connector__guide"
            data-testid="snap-guide"
            x1={snap.guideX}
            x2={snap.guideX}
            y1={Math.min(ends.source.point.y, ends.target.point.y) - 40}
            y2={Math.max(ends.source.point.y, ends.target.point.y) + 40}
          />
        )}
        {snap?.guideY != null && (
          <line
            className="connector__guide"
            data-testid="snap-guide"
            y1={snap.guideY}
            y2={snap.guideY}
            x1={Math.min(ends.source.point.x, ends.target.point.x) - 40}
            x2={Math.max(ends.source.point.x, ends.target.point.x) + 40}
          />
        )}
        {/* Grab handles first, so route handles drawn over them win where they overlap near the ends. */}
        {canEdit && !ghost && (
          <GrabHandles
            edgeId={id}
            source={ends.source}
            target={ends.target}
            sourceId={edge.source}
            targetId={edge.target}
            onOverride={onOverride}
          />
        )}
        {editable && edge.route.style !== "step" && (
          <PointHandles
            edgeId={id}
            points={points}
            addPositions={route.addHandles}
            anchors={[ends.source.point, ends.target.point]}
            onDraft={onPointDraft}
            onCommit={commitRoute}
          />
        )}
        {editable && edge.route.style === "step" && route.vertices && (
          <SegmentHandles
            vertices={route.vertices}
            source={ends.source}
            target={ends.target}
            onDraft={onSegmentDraft}
            onCommit={commitRoute}
          />
        )}
      </g>
      {!ghost && (
        <EdgeLabel
          edge={edge}
          position={label.point}
          normal={label.normal}
          measure={measure}
          selected={selected}
          hidden={routeDragging || phase === "hidden" || phase === "drawing"}
          phase={phase}
          onSlide={onSlide}
        />
      )}
    </>
  );
}

function ConnectorEdgeView({
  id,
  data,
  selected = false,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<CanvasEdge>) {
  const fallback = useMemo(
    () => ({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition],
  );
  return data ? <Connector id={id} data={data} selected={selected} fallback={fallback} /> : null;
}

export const ConnectorEdge = memo(ConnectorEdgeView);

export const edgeTypes = { connector: ConnectorEdge, floating: ConnectorEdge };
