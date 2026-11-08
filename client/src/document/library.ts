import { SHAPE_KINDS, type ShapeKind } from "../geometry/shapes";
import { NODE_KINDS, type NodeKind, type Style } from "./types";

// The shape library: what the drawer offers, how a dragged item travels to
// the canvas, and the filter box. A drag carries a small JSON payload under
// our own data-transfer type, so dropping anything else (a file, a link, text
// from another page) is ignored.

export const SHAPE_DRAG_TYPE = "application/x-live-canvas-shape";

export interface LibraryPayload {
  readonly kind: NodeKind;
  readonly shape?: ShapeKind;
  readonly style?: Style;
}

export interface LibraryItem extends LibraryPayload {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface ShelfSection {
  readonly title: string;
  readonly items: readonly LibraryItem[];
}

const shapeItem = (shape: ShapeKind, description: string): LibraryItem => ({
  id: `shape-${shape}`,
  name: shape.charAt(0).toUpperCase() + shape.slice(1),
  description,
  kind: "shape",
  shape,
});

const NOTE_COLOURS: readonly { name: string; fill: string }[] = [
  { name: "Yellow note", fill: "#fff3b0" },
  { name: "Green note", fill: "#d7f0dc" },
  { name: "Blue note", fill: "#dbe8fb" },
  { name: "Pink note", fill: "#fadde1" },
];

export const LIBRARY: readonly ShelfSection[] = [
  {
    title: "Basic",
    items: [
      { id: "step", name: "Step", description: "One task in the build plan.", kind: "step" },
      { id: "start-end", name: "Start or end", description: "Where the plan begins or finishes.", kind: "start-end" },
      { id: "label", name: "Text", description: "Free text on the canvas.", kind: "label" },
      { id: "line", name: "Line", description: "A straight divider or pointer.", kind: "line" },
      { id: "group", name: "Group", description: "A frame that holds related steps.", kind: "group" },
    ],
  },
  {
    title: "Flow diagram",
    items: [
      { id: "decision", name: "Decision", description: "A yes-or-no check that branches the plan.", kind: "decision" },
      shapeItem("hexagon", "A preparation step."),
      shapeItem("parallelogram", "Materials in or parts out."),
      shapeItem("cylinder", "Stored parts or stock."),
      shapeItem("circle", "A connector point or checkpoint."),
      shapeItem("triangle", "A warning or a merge."),
      shapeItem("diamond", "A plain diamond shape."),
    ],
  },
  {
    title: "Notes",
    items: NOTE_COLOURS.map(({ name, fill }) => ({
      id: `note-${fill}`,
      name,
      description: "A sticky note for comments and reminders.",
      kind: "note" as const,
      style: { fill },
    })),
  },
];

/** Sections narrowed to the items whose name or description contains every word of the query; empty sections are dropped. */
export function filterLibrary(sections: readonly ShelfSection[], query: string): ShelfSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...sections];
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        words.every((word) => `${item.name} ${item.description} ${section.title}`.toLowerCase().includes(word)),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export const encodeLibraryPayload = ({ kind, shape, style }: LibraryPayload): string =>
  JSON.stringify({ kind, ...(shape ? { shape } : {}), ...(style ? { style } : {}) });

/** The payload of a drop, or null for anything that is not a library item. */
export function decodeLibraryPayload(text: string): LibraryPayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const { kind, shape, style } = raw as Record<string, unknown>;
  if (!NODE_KINDS.includes(kind as NodeKind) || kind === "sketch") return null;
  if (shape !== undefined && !SHAPE_KINDS.includes(shape as ShapeKind)) return null;
  const cleanStyle =
    typeof style === "object" && style !== null
      ? Object.fromEntries(
          Object.entries(style).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : undefined;
  return {
    kind: kind as NodeKind,
    ...(shape ? { shape: shape as ShapeKind } : {}),
    ...(cleanStyle ? { style: cleanStyle } : {}),
  };
}
