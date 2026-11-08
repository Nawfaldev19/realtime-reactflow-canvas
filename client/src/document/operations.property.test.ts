import { describe, expect, it } from "vitest";
import { edge, node } from "../test/fixtures";
import { seededRandom } from "../test/random";
import { applyOperation, deleteNodes, type Operation } from "./operations";
import { EMPTY_STATE, type DocumentState } from "./types";

// Property: whatever sequence of operations arrives (including nonsense from a
// stale replay), the document never holds a dangling edge, a parent that is
// not a group, or a parent cycle.

function invariantsHold(state: DocumentState): boolean {
  const nodes = state.nodes;
  for (const entry of Object.values(state.edges)) if (!nodes[entry.source] || !nodes[entry.target]) return false;
  for (const entry of Object.values(nodes)) {
    if (entry.parentId === null) continue;
    if (nodes[entry.parentId]?.kind !== "group") return false;
    const seen = new Set<string>();
    for (let current: string | null = entry.id; current !== null; current = nodes[current]?.parentId ?? null) {
      if (seen.has(current)) return false;
      seen.add(current);
    }
  }
  return true;
}

function randomOperation(random: ReturnType<typeof seededRandom>, state: DocumentState, step: number): Operation {
  const ids = [...Object.keys(state.nodes), "ghost"];
  const edgeIds = [...Object.keys(state.edges), "ghost-edge"];
  switch (random.int(6)) {
    case 0:
      return {
        type: "node.add",
        node: node(`n${String(step)}`, {
          kind: random.next() < 0.4 ? "group" : "step",
          number: step + 1,
          parentId: random.next() < 0.5 ? random.pick(ids) : null,
        }),
      };
    case 1:
      return {
        type: "node.update",
        id: random.pick(ids),
        fields: { parentId: random.next() < 0.3 ? null : random.pick(ids), position: { x: step, y: step } },
      };
    case 2:
      return { type: "node.remove", id: random.pick(ids) };
    case 3:
      return { type: "edge.add", edge: edge(`e${String(step)}`, random.pick(ids), random.pick(ids)) };
    case 4:
      return { type: "edge.update", id: random.pick(edgeIds), fields: { target: random.pick(ids) } };
    default:
      return deleteNodes(state, [random.pick(ids)]);
  }
}

describe("operation invariants", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("hold for 300 random operations (seed %i)", (seed) => {
    const random = seededRandom(seed);
    let state = EMPTY_STATE;
    for (let step = 0; step < 300; step += 1) {
      state = applyOperation(state, randomOperation(random, state, step)).state;
      expect(invariantsHold(state)).toBe(true);
    }
  });
});
