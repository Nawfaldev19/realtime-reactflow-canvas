// No-op guards: an update that would not change anything returns the input
// itself, so reference checks downstream (zustand subscribers, memoized
// mappers, the canvas library's own equality check) see "no change" and
// nothing re-renders.

export interface XY {
  readonly x: number;
  readonly y: number;
}

export interface WH {
  readonly width: number;
  readonly height: number;
}

export const samePoint = (a: XY, b: XY): boolean => a.x === b.x && a.y === b.y;
export const sameSize = (a: WH, b: WH): boolean => a.width === b.width && a.height === b.height;

/**
 * `current` with `patch` merged in, or `current` itself when every entry of
 * the patch is already there (by `same`). An empty patch is always a no-op.
 */
export function mergeRecord<T>(
  current: Readonly<Record<string, T>>,
  patch: Readonly<Record<string, T>>,
  same: (a: T, b: T) => boolean,
): Readonly<Record<string, T>> {
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    const existing = current[key];
    if (existing === undefined || !same(existing, value)) {
      changed = true;
      break;
    }
  }
  return changed ? { ...current, ...patch } : current;
}

/** `next` when any entry differs from `previous` (by reference), otherwise `previous`, so an unchanged list keeps its identity. */
export function reuseList<T>(previous: readonly T[] | null, next: readonly T[]): readonly T[] {
  if (previous === null || previous.length !== next.length) return next;
  for (let index = 0; index < next.length; index += 1) if (previous[index] !== next[index]) return next;
  return previous;
}
