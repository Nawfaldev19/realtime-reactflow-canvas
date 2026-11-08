import type { Side } from "../document/types";
import { distance, type Box, type Vec } from "../geometry/vector";

// Where a connector attaches to a step. Explicit sides attach at those
// sides' ports; automatic sides pick the pair of facing sides that gives the
// shortest link, with hysteresis so near-ties do not flicker while a step is
// dragged.

/** Outward unit normal of each side (screen coordinates, y down). */
export const NORMALS: Readonly<Record<Side, Vec>> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

export const OPPOSITE: Readonly<Record<Side, Side>> = { left: "right", right: "left", top: "bottom", bottom: "top" };

export const isHorizontalSide = (side: Side): boolean => side === "left" || side === "right";

/** Port positions relative to the box's top-left corner (for shapes whose outline does not touch every side midpoint). */
export type PortOffsets = Readonly<Record<Side, Vec>>;

/** The midpoint of a side, or the shape's own port on that side. */
export function portPoint(box: Box, side: Side, offsets?: PortOffsets): Vec {
  if (offsets) return { x: box.x + offsets[side].x, y: box.y + offsets[side].y };
  switch (side) {
    case "top":
      return { x: box.x + box.width / 2, y: box.y };
    case "bottom":
      return { x: box.x + box.width / 2, y: box.y + box.height };
    case "left":
      return { x: box.x, y: box.y + box.height / 2 };
    case "right":
      return { x: box.x + box.width, y: box.y + box.height / 2 };
  }
}

export interface SidePair {
  readonly source: Side;
  readonly target: Side;
}

/** A new pair must beat the current one by at least this much before the connector switches. */
export const SIDE_HYSTERESIS = 4;

export interface SideChoiceInput {
  readonly source: Box;
  readonly target: Box;
  readonly sourcePorts?: PortOffsets | undefined;
  readonly targetPorts?: PortOffsets | undefined;
  /** The pair chosen last time, for hysteresis. */
  readonly previous?: SidePair | null | undefined;
}

/**
 * Closest facing sides. From the centre difference d = C_target − C_source,
 * the source's candidates are bottom/top (by the sign of d.y) and right/left
 * (by d.x); the target takes the opposite ones. Of the four pairs, the one
 * with the shortest port-to-port distance wins, but the previous pair is kept
 * unless the winner is at least SIDE_HYSTERESIS shorter. A side fixed by
 * the connector restricts the candidates to pairs that use it.
 */
export function closestSides(
  { source, target, sourcePorts, targetPorts, previous = null }: SideChoiceInput,
  fixed: { readonly source?: Side | null; readonly target?: Side | null } = {},
): SidePair {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2);
  const dy = target.y + target.height / 2 - (source.y + source.height / 2);
  const vertical: Side = dy > 0 ? "bottom" : "top";
  const horizontal: Side = dx > 0 ? "right" : "left";
  const length = (pair: SidePair) =>
    distance(portPoint(source, pair.source, sourcePorts), portPoint(target, pair.target, targetPorts));
  const sourceSides = fixed.source ? [fixed.source] : [vertical, horizontal];
  const targetSides = fixed.target ? [fixed.target] : [OPPOSITE[vertical], OPPOSITE[horizontal]];
  let best: SidePair | null = null;
  let bestLength = Infinity;
  for (const sourceSide of sourceSides) {
    for (const targetSide of targetSides) {
      const candidate = { source: sourceSide, target: targetSide };
      const candidateLength = length(candidate);
      if (candidateLength < bestLength) {
        best = candidate;
        bestLength = candidateLength;
      }
    }
  }
  const chosen = best ?? { source: vertical, target: OPPOSITE[vertical] };
  const keepable =
    previous &&
    (!fixed.source || previous.source === fixed.source) &&
    (!fixed.target || previous.target === fixed.target);
  if (
    keepable &&
    (previous.source !== chosen.source || previous.target !== chosen.target) &&
    length(previous) - bestLength < SIDE_HYSTERESIS
  ) {
    return previous;
  }
  return chosen;
}

/** Resolves explicit sides and fills the unset ones from the closest pair that uses the explicit one. */
export function resolveSides(
  explicit: { readonly source: Side | null; readonly target: Side | null },
  input: SideChoiceInput,
): SidePair {
  if (explicit.source && explicit.target) return { source: explicit.source, target: explicit.target };
  return closestSides(input, explicit);
}
