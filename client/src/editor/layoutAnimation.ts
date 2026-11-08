import type { DocumentState, Point, Size } from "../document/types";
import type { LiveFields } from "./store";

// Moving steps to a new layout over 400 ms. The new positions are already in
// the document (one operation, one undo step); the animation only shows live
// fields that travel from the old boxes to the new ones and are cleared at
// the end, so nothing of it is ever saved.

export const LAYOUT_ANIMATION_MS = 400;

/** Ease-in-out (cubic). */
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface Travel {
  readonly from: { readonly position: Point; readonly size: Size };
  readonly to: { readonly position: Point; readonly size: Size };
}

/** The nodes whose box changed between two documents, with their old and new boxes. */
export function travels(before: DocumentState, after: DocumentState): Record<string, Travel> {
  const result: Record<string, Travel> = {};
  for (const [id, node] of Object.entries(after.nodes)) {
    const old = before.nodes[id];
    if (!old || old === node) continue;
    const moved = old.position.x !== node.position.x || old.position.y !== node.position.y;
    const resized = old.size.width !== node.size.width || old.size.height !== node.size.height;
    if (moved || resized)
      result[id] = {
        from: { position: old.position, size: old.size },
        to: { position: node.position, size: node.size },
      };
  }
  return result;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The live fields for every travelling node at progress `t` in [0, 1] (already eased by the caller). */
export function framesAt(paths: Readonly<Record<string, Travel>>, t: number): Record<string, LiveFields> {
  const frames: Record<string, LiveFields> = {};
  for (const [id, { from, to }] of Object.entries(paths)) {
    frames[id] = {
      position: { x: mix(from.position.x, to.position.x, t), y: mix(from.position.y, to.position.y, t) },
      size: { width: mix(from.size.width, to.size.width, t), height: mix(from.size.height, to.size.height, t) },
    };
  }
  return frames;
}

export interface AnimationClock {
  readonly now: () => number;
  readonly request: (callback: () => void) => number;
  readonly cancel: (handle: number) => void;
}

const browserClock: AnimationClock = {
  now: () => performance.now(),
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => {
    window.cancelAnimationFrame(handle);
  },
};

/**
 * Plays the travel with `show` (setLive), clearing every live field at the
 * end. Returns a function that stops it at once (and clears the fields).
 * Calls `done` when finished or stopped.
 */
export function playTravels(
  paths: Readonly<Record<string, Travel>>,
  show: (entries: Readonly<Record<string, LiveFields | null>>) => void,
  done: () => void,
  { duration = LAYOUT_ANIMATION_MS, clock = browserClock }: { duration?: number; clock?: AnimationClock } = {},
): () => void {
  const ids = Object.keys(paths);
  const clear = () => show(Object.fromEntries(ids.map((id) => [id, null])));
  if (ids.length === 0) {
    done();
    return () => undefined;
  }
  const start = clock.now();
  let handle: number | null = null;
  const tick = () => {
    const progress = Math.min(1, (clock.now() - start) / duration);
    if (progress >= 1) {
      handle = null;
      clear();
      done();
      return;
    }
    show(framesAt(paths, easeInOut(progress)));
    handle = clock.request(tick);
  };
  show(framesAt(paths, 0));
  handle = clock.request(tick);
  return () => {
    if (handle === null) return;
    clock.cancel(handle);
    handle = null;
    clear();
    done();
  };
}
