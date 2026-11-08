import { useState, type FocusEvent } from "react";
import {
  ChevronDown,
  Circle,
  Cylinder,
  Diamond,
  Hexagon,
  Flag,
  Minus,
  Pencil,
  RectangleHorizontal,
  Shapes,
  Square,
  StickyNote,
  Triangle,
  Type,
} from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { DEFAULT_SIZES } from "../document/factory";
import type { EdgeKind, NodeKind, RouteStyle } from "../document/types";
import type { ShapeKind } from "../geometry/shapes";
import { ROUTE_STYLE_OPTIONS } from "./ConnectorProperties";
import { useEditor, useEditorStoreApi } from "./EditorStoreContext";
import { LayoutMenu } from "./LayoutMenu";
import { SnapMenu } from "./SnapMenu";

type Icon = typeof Diamond;

const TOOLS: readonly { kind: NodeKind; label: string; Icon: Icon }[] = [
  { kind: "step", label: "Add step", Icon: RectangleHorizontal },
  { kind: "decision", label: "Add decision", Icon: Diamond },
  { kind: "start-end", label: "Add start or end", Icon: Flag },
  { kind: "note", label: "Add sticky note", Icon: StickyNote },
  { kind: "label", label: "Add text label", Icon: Type },
  { kind: "line", label: "Add line", Icon: Minus },
];

export const SHAPE_MENU: readonly { shape: ShapeKind; label: string; Icon: Icon }[] = [
  { shape: "diamond", label: "Diamond", Icon: Diamond },
  { shape: "hexagon", label: "Hexagon", Icon: Hexagon },
  { shape: "circle", label: "Circle", Icon: Circle },
  { shape: "triangle", label: "Triangle", Icon: Triangle },
  { shape: "parallelogram", label: "Parallelogram", Icon: Square },
  { shape: "cylinder", label: "Cylinder", Icon: Cylinder },
];

/**
 * Adds nodes at the centre of the visible canvas, picks the style of new
 * connectors, lays out, sets snapping and switches draw mode. Dragging shapes
 * in is the shape library's job.
 */
export function EditorToolbar() {
  const api = useEditorStoreApi();
  const canEdit = useEditor((state) => state.canEdit);
  const drawMode = useEditor((state) => state.drawMode);
  const defaults = useEditor((state) => state.connectorDefaults);
  const [shapesOpen, setShapesOpen] = useState(false);
  const { screenToFlowPosition } = useReactFlow();
  if (!canEdit) return null;

  const add = (kind: NodeKind, shape?: ShapeKind) => {
    const pane = document.querySelector(".editor-canvas")?.getBoundingClientRect();
    const center = pane
      ? screenToFlowPosition({ x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 })
      : { x: 0, y: 0 };
    const size = DEFAULT_SIZES[kind];
    api.getState().setDrawMode(false);
    api
      .getState()
      .addNode(
        kind,
        { x: Math.round(center.x - size.width / 2), y: Math.round(center.y - size.height / 2) },
        shape ? { shape } : {},
      );
  };

  const closeOnLeave = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setShapesOpen(false);
  };

  return (
    <div className="editor-tools" role="toolbar" aria-label="Add to diagram">
      {TOOLS.map(({ kind, label, Icon }) => (
        <button
          key={kind}
          type="button"
          className="button button-secondary button-icon"
          title={label}
          aria-label={label}
          onClick={() => add(kind)}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
      <div className="menu-anchor" onBlur={closeOnLeave}>
        <button
          type="button"
          className="button button-secondary"
          aria-haspopup="menu"
          aria-expanded={shapesOpen}
          onClick={() => setShapesOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setShapesOpen(false);
          }}
        >
          <Shapes size={16} aria-hidden="true" /> Shape <ChevronDown size={14} aria-hidden="true" />
        </button>
        {shapesOpen && (
          <div className="menu" role="menu" aria-label="Shapes">
            {SHAPE_MENU.map(({ shape, label, Icon }) => (
              <button
                key={shape}
                type="button"
                role="menuitem"
                className="menu__item"
                onClick={() => {
                  setShapesOpen(false);
                  add("shape", shape);
                }}
              >
                <Icon size={16} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="toolbar-select">
        <span className="visually-hidden">New connector style</span>
        <select
          className="input input-compact"
          aria-label="New connector style"
          value={`${defaults.kind}:${defaults.style}`}
          onChange={(event) => {
            const [kind, style] = event.target.value.split(":") as [EdgeKind, RouteStyle];
            api.getState().setConnectorDefaults({ kind, style });
          }}
        >
          {ROUTE_STYLE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={`connector:${value}`}>
              {label} connector
            </option>
          ))}
          <option value="floating:polyline">Floating connector</option>
        </select>
      </label>
      <LayoutMenu />
      <SnapMenu />
      <button
        type="button"
        className="button button-secondary"
        aria-pressed={drawMode}
        onClick={() => api.getState().setDrawMode(!drawMode)}
      >
        <Pencil size={16} aria-hidden="true" /> Draw
      </button>
    </div>
  );
}
