import { STROKE_PATTERNS, type StrokePattern } from "../geometry/dash";
import { isColor } from "./colors";
import { TEXT_ALIGNMENTS, type DiagramEdge, type EdgeLabel, type Style, type TextAlignment } from "./types";

// Typed, defaulted readers for a connector's style and label. The keys are
// optional in the stored document; the server validates the same keys
// (server/app/services/edge_content_rules.rb).

export const MARKERS = ["none", "open", "closed"] as const;
export type Marker = (typeof MARKERS)[number];
export const EDGE_LAYERS = ["back", "normal", "front"] as const;
export type EdgeLayer = (typeof EDGE_LAYERS)[number];

export const EDGE_WIDTH = { min: 0, max: 10, default: 2 } as const;
export const MARKER_SIZE = { min: 10, max: 30, default: 10 } as const;
export const LABEL_FONT_SIZE = { min: 10, max: 40, default: 12 } as const;
export const LABEL_MAX_WIDTH = { min: 100, max: 500, default: 250 } as const;
export const LABEL_PADDING = { min: 0, max: 20, default: 3 } as const;
export const LABEL_BORDER_WIDTH = { min: 1, max: 5, default: 1 } as const;
export const LABEL_TEXT_MAX = 500;
/** Route points per connector; the server enforces the same cap. */
export const MAX_ROUTE_POINTS = 200;

/** Default label position for plain connectors, and for editable ones (clear of the central handle). */
export const LABEL_T = 0.5;
export const EDITABLE_LABEL_T = 0.385;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const inRange = (value: unknown, range: { readonly min: number; readonly max: number }): value is number =>
  finite(value) && value >= range.min && value <= range.max;
const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const colorOrNull = (value: unknown): string | null => (isColor(value) ? value : null);

export interface EdgeLook {
  /** Line colour; null uses the theme's connector colour. */
  readonly color: string | null;
  readonly width: number;
  readonly pattern: StrokePattern;
  /** Marching ants; only takes effect for dotted and dashed lines. */
  readonly animated: boolean;
  readonly startMarker: Marker;
  readonly endMarker: Marker;
  /** Marker colours; null follows the line colour. */
  readonly startMarkerColor: string | null;
  readonly endMarkerColor: string | null;
  readonly markerSize: number;
  readonly layer: EdgeLayer;
}

export function edgeLook(edge: DiagramEdge): EdgeLook {
  const { style } = edge;
  return {
    color: colorOrNull(style.stroke),
    width: inRange(style.width, EDGE_WIDTH) ? style.width : EDGE_WIDTH.default,
    pattern: oneOf(STROKE_PATTERNS, style.pattern, "solid"),
    animated: style.animated === true,
    startMarker: oneOf(MARKERS, style.startMarker, "none"),
    endMarker: oneOf(MARKERS, style.endMarker, "closed"),
    startMarkerColor: colorOrNull(style.startMarkerColor),
    endMarkerColor: colorOrNull(style.endMarkerColor),
    markerSize: inRange(style.markerSize, MARKER_SIZE) ? style.markerSize : MARKER_SIZE.default,
    layer: oneOf(EDGE_LAYERS, style.layer, "normal"),
  };
}

export interface LabelLook {
  readonly fontSize: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly align: TextAlignment;
  readonly color: string | null;
  /** Null uses the canvas background. */
  readonly background: string | null;
  readonly maxWidth: number;
  readonly padding: number;
  readonly border: boolean;
  readonly borderWidth: number;
  readonly borderColor: string | null;
}

export function labelLook(label: EdgeLabel | null): LabelLook {
  return {
    fontSize: inRange(label?.fontSize, LABEL_FONT_SIZE) ? label.fontSize : LABEL_FONT_SIZE.default,
    bold: label?.bold === true,
    italic: label?.italic === true,
    underline: label?.underline === true,
    align: oneOf(TEXT_ALIGNMENTS, label?.align, "center"),
    color: colorOrNull(label?.color),
    background: colorOrNull(label?.background),
    maxWidth: inRange(label?.maxWidth, LABEL_MAX_WIDTH) ? label.maxWidth : LABEL_MAX_WIDTH.default,
    padding: inRange(label?.padding, LABEL_PADDING) ? label.padding : LABEL_PADDING.default,
    border: label?.border === true,
    borderWidth: inRange(label?.borderWidth, LABEL_BORDER_WIDTH) ? label.borderWidth : LABEL_BORDER_WIDTH.default,
    borderColor: colorOrNull(label?.borderColor),
  };
}

/** Font weight: 700 normally and 900 when bold (labels are always strong enough to read on a line). */
export const labelWeight = (look: LabelLook): number => (look.bold ? 900 : 700);

/** The stored label position, or the default for the connector's kind when it has none. */
export function labelFraction(edge: DiagramEdge): number {
  const t = edge.label?.t;
  if (finite(t)) return Math.min(1, Math.max(0, t));
  return edge.kind === "connector" ? EDITABLE_LABEL_T : LABEL_T;
}

/** Merges a patch into a style; null removes a key. */
export function withStyleKeys(style: Style, patch: Readonly<Record<string, string | number | boolean | null>>): Style {
  const merged = Object.entries({ ...style, ...patch }).filter(
    (entry): entry is [string, string | number | boolean] => entry[1] !== null,
  );
  return Object.fromEntries(merged);
}

/** Merges a patch into a label (creating an empty one if needed); undefined removes a key. */
export function withLabelKeys(label: EdgeLabel | null, patch: Partial<EdgeLabel>): EdgeLabel {
  const combined: Record<string, unknown> = { text: "", ...label, ...patch };
  const merged = Object.entries(combined).filter(([, value]) => value !== undefined);
  return Object.fromEntries(merged) as unknown as EdgeLabel;
}
