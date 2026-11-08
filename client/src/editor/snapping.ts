import { absoluteBox, isAncestor } from "../document/groups";
import { boxStyle } from "../document/nodeData";
import { absolutePosition, descendantsOf } from "../document/operations";
import type { DocumentState, Point, Size } from "../document/types";
import {
  EMPTY_MEMORY,
  GuideIndex,
  NO_GUIDES,
  guideColor,
  snapMove,
  snapResize,
  viewportBox,
  type ActiveGuides,
  type GuideMemory,
  type GuideSource,
  type Viewport,
} from "../geometry/guides";
import { boundsOf, type Box } from "../geometry/vector";

// Alignment snapping for one editing session, between the canvas's change
// events and the store. Drag and resize frames are rewritten before they are
// applied, so snapping costs no extra render; only the two visible guides are
// reactive state.
//
// The guide index is built when a gesture starts, from every step except the
// moving ones, their descendants and their ancestors (absolute boxes, so steps
// in groups snap to steps outside and the reverse). It is not rebuilt on
// every frame: when the document changes during the gesture (a collaborator
// moves a step, an undo lands), only the changed steps are re-indexed, plus
// the contents of any group that moved. Culling uses the viewport of the
// current frame, so auto-panning is handled.

export interface SnapSettings {
  readonly enabled: boolean;
  /** Snap radius in screen pixels. */
  readonly radius: number;
  /** Only the K nearest steps can produce guides. */
  readonly nearest: number;
  /** When set, only this step's guides count ("snap only to this step"). */
  readonly referenceId: string | null;
}

export const DEFAULT_SNAP: SnapSettings = { enabled: true, radius: 8, nearest: 2, referenceId: null };

export interface SnapView {
  readonly viewport: Viewport;
  /** The canvas element's size in screen pixels. */
  readonly width: number;
  readonly height: number;
}

interface Session {
  readonly doc: DocumentState;
  readonly excluded: ReadonlySet<string>;
  readonly index: GuideIndex;
  readonly memory: GuideMemory;
}

/** The moving nodes, everything inside them and everything they are inside. */
export function relatedIds(doc: DocumentState, ids: readonly string[]): Set<string> {
  const related = new Set<string>();
  for (const id of ids) {
    related.add(id);
    for (const child of descendantsOf(doc, id)) related.add(child);
    for (
      let parent = doc.nodes[id]?.parentId ?? null;
      parent !== null && !related.has(parent);
      parent = doc.nodes[parent]?.parentId ?? null
    )
      related.add(parent);
  }
  return related;
}

function sourceOf(doc: DocumentState, id: string): GuideSource | null {
  const node = doc.nodes[id];
  const box = absoluteBox(doc, id);
  if (!node || !box) return null;
  return { id, box, color: guideColor(boxStyle(node).fill) };
}

function buildIndex(doc: DocumentState, excluded: ReadonlySet<string>): GuideIndex {
  const sources: GuideSource[] = [];
  for (const id of Object.keys(doc.nodes)) {
    if (excluded.has(id)) continue;
    const source = sourceOf(doc, id);
    if (source) sources.push(source);
  }
  return GuideIndex.build(sources);
}

/** Re-indexes the steps whose objects changed between two documents (and the contents of changed groups). */
export function refreshIndex(
  index: GuideIndex,
  before: DocumentState,
  after: DocumentState,
  excluded: ReadonlySet<string>,
): void {
  const touched = new Set<string>();
  for (const [id, node] of Object.entries(after.nodes)) {
    if (before.nodes[id] === node) continue;
    touched.add(id);
    if (node.kind === "group") for (const child of descendantsOf(after, id)) touched.add(child);
  }
  for (const id of Object.keys(before.nodes)) if (!(id in after.nodes)) touched.add(id);
  for (const id of touched) {
    const source = excluded.has(id) ? null : sourceOf(after, id);
    if (source) index.upsert(source);
    else index.remove(id);
  }
}

export interface MoveSnap {
  /** The proposed positions, shifted by the snap (only for nodes without a moving ancestor). */
  readonly positions: Readonly<Record<string, Point>>;
  readonly guides: ActiveGuides;
}

export interface ResizeSnap {
  readonly position: Point;
  readonly size: Size;
  readonly guides: ActiveGuides;
}

/** True when two numbers are the same edge (resize frames carry rounding noise). */
const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export class Snapper {
  private session: Session | null = null;

  /** True while a gesture is being snapped. */
  get active(): boolean {
    return this.session !== null;
  }

  private begin(doc: DocumentState, ids: readonly string[]): Session {
    const excluded = relatedIds(doc, ids);
    this.session = { doc, excluded, index: buildIndex(doc, excluded), memory: EMPTY_MEMORY };
    return this.session;
  }

  private current(doc: DocumentState, ids: readonly string[]): Session {
    const session = this.session ?? this.begin(doc, ids);
    if (session.doc === doc) return session;
    refreshIndex(session.index, session.doc, doc, session.excluded);
    this.session = { ...session, doc };
    return this.session;
  }

  private options(doc: DocumentState, view: SnapView, settings: SnapSettings, excluded: ReadonlySet<string>) {
    const referenceId =
      settings.referenceId !== null && settings.referenceId in doc.nodes && !excluded.has(settings.referenceId)
        ? settings.referenceId
        : null;
    return {
      radius: settings.radius / view.viewport.zoom,
      viewport: viewportBox(view.viewport, view.width, view.height),
      excluded,
      referenceId,
      nearest: settings.nearest,
    };
  }

  /** Snaps a drag frame. `proposed` holds parent-relative positions, as the canvas reports them. */
  move(
    doc: DocumentState,
    proposed: Readonly<Record<string, Point>>,
    view: SnapView,
    settings: SnapSettings,
  ): MoveSnap {
    const ids = Object.keys(proposed).filter((id) => id in doc.nodes);
    if (!settings.enabled || ids.length === 0) return { positions: proposed, guides: NO_GUIDES };
    const session = this.current(doc, ids);
    const leaders = ids.filter((id) => !ids.some((other) => other !== id && isAncestor(doc, other, id)));
    const boxes: Box[] = leaders.map((id) => {
      const node = doc.nodes[id] as (typeof doc.nodes)[string];
      const origin = node.parentId === null ? { x: 0, y: 0 } : absolutePosition(doc, node.parentId);
      const position = proposed[id] as Point;
      return { x: origin.x + position.x, y: origin.y + position.y, ...node.size };
    });
    const bounds = boundsOf(boxes) as Box;
    const result = snapMove(session.index, bounds, this.options(doc, view, settings, session.excluded), session.memory);
    this.session = { ...session, memory: result.memory };
    const dx = result.box.x - bounds.x;
    const dy = result.box.y - bounds.y;
    if (dx === 0 && dy === 0) return { positions: proposed, guides: result.guides };
    const positions: Record<string, Point> = { ...proposed };
    for (const id of leaders) {
      const position = proposed[id] as Point;
      positions[id] = { x: position.x + dx, y: position.y + dy };
    }
    return { positions, guides: result.guides };
  }

  /**
   * Snaps a resize frame of one node. The edges that move are found by
   * comparing the proposed box with the committed one: a changed left edge
   * means a left handle, a changed right edge a right handle, and so on.
   */
  resize(
    doc: DocumentState,
    id: string,
    proposed: { readonly position: Point; readonly size: Size },
    view: SnapView,
    settings: SnapSettings,
    minimum: Size,
  ): ResizeSnap {
    const node = doc.nodes[id];
    const start = absoluteBox(doc, id);
    if (!settings.enabled || !node || !start) return { ...proposed, guides: NO_GUIDES };
    const session = this.current(doc, [id]);
    const origin = node.parentId === null ? { x: 0, y: 0 } : absolutePosition(doc, node.parentId);
    const box: Box = { x: origin.x + proposed.position.x, y: origin.y + proposed.position.y, ...proposed.size };
    const edges = {
      left: !same(box.x, start.x),
      right: !same(box.x + box.width, start.x + start.width),
      top: !same(box.y, start.y),
      bottom: !same(box.y + box.height, start.y + start.height),
    };
    const result = snapResize(
      session.index,
      box,
      edges,
      this.options(doc, view, settings, session.excluded),
      session.memory,
      minimum,
    );
    this.session = { ...session, memory: result.memory };
    return {
      position: { x: result.box.x - origin.x, y: result.box.y - origin.y },
      size: { width: result.box.width, height: result.box.height },
      guides: result.guides,
    };
  }

  /** Ends the gesture: the index and the remembered guides are dropped. */
  end(): void {
    this.session = null;
  }
}
