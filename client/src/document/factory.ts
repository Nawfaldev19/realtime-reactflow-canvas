import { boxForLine } from "../geometry/line";
import type { CommittedStroke } from "../geometry/freehand";
import type { ShapeKind } from "../geometry/shapes";
import { LINE_THICKNESS, SKETCH_SIZE } from "./nodeData";
import type {
  DiagramEdge,
  DiagramNode,
  DocumentState,
  EdgeKind,
  NodeData,
  NodeKind,
  Point,
  RoutePoint,
  RouteStyle,
  Side,
  Size,
} from "./types";

const DEFAULT_LINE_LENGTH = 160;
const DEFAULT_LINE_ROTATION = 90;
const LINE_BOX = boxForLine({ x: 0, y: 0 }, DEFAULT_LINE_LENGTH, DEFAULT_LINE_ROTATION);

export const DEFAULT_SIZES: Readonly<Record<NodeKind, Size>> = {
  step: { width: 180, height: 64 },
  decision: { width: 150, height: 100 },
  "start-end": { width: 180, height: 56 },
  note: { width: 200, height: 110 },
  label: { width: 160, height: 40 },
  shape: { width: 140, height: 120 },
  line: { width: LINE_BOX.width, height: LINE_BOX.height },
  sketch: { width: 160, height: 120 },
  group: { width: 320, height: 220 },
};

export const DEFAULT_TEXT: Readonly<Record<NodeKind, string>> = {
  step: "New step",
  decision: "Decide?",
  "start-end": "Start",
  note: "Note",
  label: "",
  shape: "",
  line: "",
  sketch: "",
  group: "Group",
};

function defaultData(kind: NodeKind, shape: ShapeKind): NodeData {
  switch (kind) {
    case "line":
      return {
        rotation: DEFAULT_LINE_ROTATION,
        length: DEFAULT_LINE_LENGTH,
        thickness: LINE_THICKNESS.default,
        lineStyle: "solid",
      };
    case "sketch":
      return { points: [], initialSize: DEFAULT_SIZES.sketch, strokeSize: SKETCH_SIZE.default };
    case "shape":
      return { text: "", shape };
    default:
      return { text: DEFAULT_TEXT[kind] };
  }
}

export type IdFactory = () => string;

export const randomId: IdFactory = () => crypto.randomUUID();

function topZ(state: DocumentState): number {
  let top = 0;
  for (const node of Object.values(state.nodes)) top = Math.max(top, node.z);
  return top;
}

export interface CreateOptions {
  readonly newId?: IdFactory;
  readonly parentId?: string | null;
  /** For `shape` nodes: which outline to use. */
  readonly shape?: ShapeKind;
}

/** A new node of `kind` at `position`, numbered from the document counter and placed on top. */
export function createNode(
  state: DocumentState,
  kind: NodeKind,
  position: Point,
  { newId = randomId, parentId = null, shape = "hexagon" }: CreateOptions = {},
): DiagramNode {
  const id = newId();
  return {
    id,
    key: id,
    kind,
    number: state.nextNumber,
    position,
    size: DEFAULT_SIZES[kind],
    parentId,
    z: topZ(state) + 1,
    style: {},
    data: defaultData(kind, shape),
  };
}

export interface SketchStyle {
  readonly color: string | null;
  readonly strokeSize: number;
}

/** A sketch node from a committed stroke: box-relative samples plus the box size they were drawn in. */
export function createSketchNode(
  state: DocumentState,
  stroke: CommittedStroke,
  style: SketchStyle,
  { newId = randomId }: { newId?: IdFactory } = {},
): DiagramNode {
  const base = createNode(state, "sketch", { x: stroke.box.x, y: stroke.box.y }, { newId });
  const size = { width: stroke.box.width, height: stroke.box.height };
  return {
    ...base,
    size,
    data: {
      points: stroke.points,
      initialSize: size,
      strokeSize: style.strokeSize,
      ...(style.color ? { color: style.color } : {}),
    },
  };
}

export interface EdgeOptions {
  readonly newId?: IdFactory;
  readonly kind?: EdgeKind;
  readonly style?: RouteStyle;
  readonly sourceSide?: Side | null;
  readonly targetSide?: Side | null;
  readonly points?: readonly RoutePoint[];
}

/** A new connector. Its stroke, markers and label use the readers' defaults (a 2-wide solid line with a closed end arrow). */
export function createEdge(
  source: string,
  target: string,
  {
    newId = randomId,
    kind = "connector",
    style = "step",
    sourceSide = null,
    targetSide = null,
    points = [],
  }: EdgeOptions = {},
): DiagramEdge {
  const id = newId();
  return {
    id,
    key: id,
    kind,
    source,
    target,
    sourceSide,
    targetSide,
    route: { style, points },
    label: null,
    style: {},
  };
}
