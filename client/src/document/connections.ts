import { isAncestor } from "./groups";
import { KIND_TRAITS } from "./nodeKinds";
import type { DocumentState } from "./types";

// Which edges may be created. The same rule feeds the canvas's connection
// preview (invalid targets never highlight) and the store's connect action.

export type ConnectRefusal = "missing" | "self" | "unconnectable" | "group-child" | "duplicate";

export function connectRefusal(state: DocumentState, source: string, target: string): ConnectRefusal | null {
  const from = state.nodes[source];
  const to = state.nodes[target];
  if (!from || !to) return "missing";
  if (source === target) return "self";
  if (!KIND_TRAITS[from.kind].connectable || !KIND_TRAITS[to.kind].connectable) return "unconnectable";
  // A group and its own descendants are never connected: the edge would run inside its own frame.
  if (isAncestor(state, source, target) || isAncestor(state, target, source)) return "group-child";
  for (const edge of Object.values(state.edges))
    if (edge.source === source && edge.target === target) return "duplicate";
  return null;
}

export const canConnect = (state: DocumentState, source: string, target: string): boolean =>
  connectRefusal(state, source, target) === null;
