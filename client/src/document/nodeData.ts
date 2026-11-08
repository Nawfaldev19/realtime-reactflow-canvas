import { normalizeAngle } from "../geometry/angles";
import { chunkPoints, DEFAULT_STROKE, type StrokePoint } from "../geometry/freehand";
import { lengthInBox, MIN_LINE_LENGTH } from "../geometry/line";
import { isShapeKind, type ShapeKind } from "../geometry/shapes";
import { isColor } from "./colors";
import type { DiagramNode, Size } from "./types";

// Typed, defaulted readers for the kind-specific keys in node.data and
// node.style. Documents are parsed defensively, so every reader tolerates
// missing or malformed values and falls back to a default.

export const BORDER_STYLES = ["solid", "dashed", "dotted"] as const;
export type BorderStyle = (typeof BORDER_STYLES)[number];
export const LINE_STYLES = BORDER_STYLES;
export type LineStyle = BorderStyle;
export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export const LINE_THICKNESS = { min: 1, max: 20, default: 4 } as const;
export const FONT_SIZE = { min: 8, max: 96, default: 14 } as const;
export const BORDER_WIDTH = { min: 0, max: 20 } as const;
export const SKETCH_SIZE = { min: 1, max: 40, default: DEFAULT_STROKE.size } as const;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number): value is number =>
  finite(value) && value >= min && value <= max;
const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const colorOrNull = (value: unknown): string | null => (isColor(value) ? value : null);

export function nodeText(node: DiagramNode): string {
  return typeof node.data.text === "string" ? node.data.text : "";
}

export interface TextFormat {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly align: TextAlign;
  readonly fontSize: number;
  readonly color: string | null;
}

const LEFT_ALIGNED = new Set(["note", "label", "group"]);

export function textFormat(node: DiagramNode): TextFormat {
  const { style } = node;
  return {
    bold:
      style.fontWeight === "bold" ||
      (style.fontWeight === undefined && (node.kind === "start-end" || node.kind === "group")),
    italic: style.fontStyle === "italic",
    align: oneOf(TEXT_ALIGNS, style.textAlign, LEFT_ALIGNED.has(node.kind) ? "left" : "center"),
    fontSize: inRange(style.fontSize, FONT_SIZE.min, FONT_SIZE.max) ? style.fontSize : FONT_SIZE.default,
    color: colorOrNull(style.color),
  };
}

export interface BoxStyle {
  readonly fill: string | null;
  readonly stroke: string | null;
  readonly borderWidth: number | null;
  readonly borderStyle: BorderStyle | null;
  readonly opacity: number;
  readonly keepAspectRatio: boolean;
}

export function boxStyle(node: DiagramNode): BoxStyle {
  const { style } = node;
  return {
    fill: colorOrNull(style.fill),
    stroke: colorOrNull(style.stroke),
    borderWidth: inRange(style.borderWidth, BORDER_WIDTH.min, BORDER_WIDTH.max) ? style.borderWidth : null,
    borderStyle: BORDER_STYLES.includes(style.borderStyle as BorderStyle) ? (style.borderStyle as BorderStyle) : null,
    opacity: inRange(style.opacity, 0, 1) ? style.opacity : 0.5,
    keepAspectRatio: style.keepAspectRatio === true,
  };
}

export interface LineProps {
  /** Degrees in [0, 360); 0 points up, 90 points right. */
  readonly rotation: number;
  /** Stored length. Never derived from the box diagonal, so rotations cannot drift it. */
  readonly length: number;
  readonly thickness: number;
  readonly color: string | null;
  readonly lineStyle: LineStyle;
}

export function lineProps(node: DiagramNode): LineProps {
  const { data, size } = node;
  const rotation = finite(data.rotation) ? normalizeAngle(data.rotation) : 90;
  const length =
    finite(data.length) && data.length > 0
      ? Math.max(data.length, MIN_LINE_LENGTH)
      : Math.max(lengthInBox(size.width, size.height, rotation), MIN_LINE_LENGTH);
  return {
    rotation,
    length,
    thickness: inRange(data.thickness, LINE_THICKNESS.min, LINE_THICKNESS.max)
      ? data.thickness
      : LINE_THICKNESS.default,
    color: colorOrNull(data.color),
    lineStyle: oneOf(LINE_STYLES, data.lineStyle, "solid"),
  };
}

/** SVG dash pattern: dashed is "10,5"; dotted uses dash = thickness and gap = twice the thickness. */
export function dashArray(lineStyle: LineStyle, thickness: number): string | undefined {
  if (lineStyle === "dashed") return "10,5";
  if (lineStyle === "dotted") return `${String(thickness)},${String(thickness * 2)}`;
  return undefined;
}

export interface SketchProps {
  readonly points: StrokePoint[];
  /** Box size when the stroke was drawn; rendering scales the points from it. */
  readonly initialSize: Size;
  readonly color: string | null;
  readonly strokeSize: number;
}

export function sketchProps(node: DiagramNode): SketchProps {
  const { data, size } = node;
  const flat = Array.isArray(data.points) ? data.points.filter(finite) : [];
  const initial = data.initialSize as Partial<Size> | undefined;
  const initialSize =
    initial && finite(initial.width) && finite(initial.height) && initial.width > 0 && initial.height > 0
      ? { width: initial.width, height: initial.height }
      : size;
  return {
    points: chunkPoints(flat),
    initialSize,
    color: colorOrNull(data.color),
    strokeSize: inRange(data.strokeSize, SKETCH_SIZE.min, SKETCH_SIZE.max) ? data.strokeSize : SKETCH_SIZE.default,
  };
}

/** The outline a node is drawn with: decisions are diamonds; shapes name theirs. */
export function shapeOf(node: DiagramNode): ShapeKind | null {
  if (node.kind === "decision") return "diamond";
  if (node.kind !== "shape") return null;
  return isShapeKind(node.data.shape) ? node.data.shape : "hexagon";
}
