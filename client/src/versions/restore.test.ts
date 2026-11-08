import { describe, expect, it } from "vitest";
import { edge, node, sampleState, sequentialIds, stateOf } from "../test/fixtures";
import { seededRandom } from "../test/random";
import { applyOperation, type Operation } from "../document/operations";
import { diffStates, EMPTY_HISTORY, recordEntry, step } from "../document/history";
import type { DiagramLayout, DiagramNode, DocumentState, NodeKind } from "../document/types";
import { diffDocuments } from "./diff";
import { restoreOperation } from "./restore";

const restore = (current: DocumentState, target: DocumentState) => {
  const op = restoreOperation(current, target, { newId: sequentialIds("fresh") });
  const result = op ? applyOperation(current, op) : { state: current, skipped: 0 };
  return { op, ...result };
};

const leaves = (op: Operation | null): Operation[] =>
  op === null ? [] : op.type === "batch" ? op.ops.flatMap(leaves) : [op];

const without = (state: DocumentState, ids: readonly string[]): DocumentState =>
  stateOf(
    Object.values(state.nodes).filter((entry) => !ids.includes(entry.id)),
    Object.values(state.edges).filter((entry) => !ids.includes(entry.source) && !ids.includes(entry.target)),
    state.nextNumber,
  );

describe("restoreOperation", () => {
  it("is null when the current document already shows the version", () => {
    expect(restoreOperation(sampleState(), sampleState())).toBeNull();
  });

  it("brings back removed steps and connectors with their own ids, in one batch", () => {
    const version = sampleState();
    const { op, state, skipped } = restore(without(version, ["c"]), version);

    expect(op?.type).toBe("batch");
    expect(skipped).toBe(0);
    expect(state.nodes.c).toEqual(version.nodes.c);
    expect(state.edges.bc).toEqual(version.edges.bc);
    expect(diffDocuments(version, state).identical).toBe(true);
  });

  it("removes what the version does not have, connectors before steps", () => {
    const version = without(sampleState(), ["c"]);
    const current = sampleState();
    const { op, state } = restore(current, version);
    const types = leaves(op).map((leaf) => leaf.type);

    expect(types).toEqual(["edge.remove", "node.remove"]);
    expect(Object.keys(state.nodes)).not.toContain("c");
    expect(diffDocuments(version, state).identical).toBe(true);
  });

  it("writes only the fields that differ, and removes data keys the version did not have", () => {
    const version = sampleState();
    const current = {
      ...version,
      nodes: {
        ...version.nodes,
        c: { ...(version.nodes.c as DiagramNode), position: { x: 1, y: 2 }, data: { text: "c", shape: "circle" } },
      },
    };
    const { op, state } = restore(current, version);

    expect(leaves(op)).toEqual([
      { type: "node.update", id: "c", fields: { position: { x: 600, y: 100 }, data: { shape: undefined } } },
    ]);
    expect(state.nodes.c).toEqual(version.nodes.c);
  });

  it("moves children back into their groups, outer groups first, and keeps grouped children when a group goes", () => {
    // The version: group g holds group h, which holds a. Now: everything at the top level, plus a group x holding a.
    const version = stateOf([
      node("g", { kind: "group", position: { x: 100, y: 100 } }),
      node("h", { kind: "group", number: 2, parentId: "g", position: { x: 10, y: 10 } }),
      node("a", { number: 3, parentId: "h", position: { x: 5, y: 5 } }),
    ]);
    const current = stateOf(
      [
        node("g", { kind: "group", position: { x: 100, y: 100 } }),
        node("h", { kind: "group", number: 2, position: { x: 10, y: 10 } }),
        node("x", { kind: "group", number: 4 }),
        node("a", { number: 3, parentId: "x", position: { x: 5, y: 5 } }),
      ],
      [],
      5,
    );
    const { op, state, skipped } = restore(current, version);
    const regroups = leaves(op).filter((leaf) => leaf.type === "node.update" && "parentId" in leaf.fields);

    expect(regroups).toEqual([
      { type: "node.update", id: "h", fields: { parentId: "g" } },
      { type: "node.update", id: "a", fields: { parentId: "h" } },
    ]);
    expect(skipped).toBe(0);
    expect(state.nodes.a?.parentId).toBe("h");
    expect(state.nodes.x).toBeUndefined();
  });

  it("restores a removed group with its children inside it", () => {
    const version = sampleState();
    const { state, skipped } = restore(without(version, ["g", "a", "b"]), version);

    expect(skipped).toBe(0);
    expect([state.nodes.a?.parentId, state.nodes.b?.parentId]).toEqual(["g", "g"]);
    expect(state.edges.ab).toEqual(version.edges.ab);
  });

  it("matches by stable key: a version with other ids restores onto the current steps and remaps every reference", () => {
    const current = sampleState();
    const id = (old: string) => `v-${old}`;
    const version = stateOf(
      Object.values(current.nodes).map((entry) => ({
        ...entry,
        id: id(entry.id),
        parentId: entry.parentId && id(entry.parentId),
        data: { text: `${entry.id}!` },
      })),
      Object.values(current.edges).map((entry) => ({
        ...entry,
        id: id(entry.id),
        source: id(entry.source),
        target: id(entry.target),
      })),
    );
    const { op, state } = restore(current, version);

    expect(leaves(op).every((leaf) => leaf.type === "node.update")).toBe(true);
    expect(Object.keys(state.nodes).sort()).toEqual(["a", "b", "c", "g"]);
    expect(state.nodes.a?.data.text).toBe("a!");
    expect(diffDocuments(version, state).identical).toBe(true);
  });

  it("gives an added step a fresh id when its id is taken by an unrelated step, and remaps its children and connectors", () => {
    const current = stateOf([node("g", { key: "other", number: 1 })], [], 2);
    const version = stateOf(
      [node("g", { kind: "group", number: 1 }), node("a", { number: 2, parentId: "g" })],
      [edge("e", "g", "a")],
    );
    const { state, skipped } = restore(current, version);

    expect(skipped).toBe(0);
    expect(state.nodes.g).toBeUndefined();
    expect(state.nodes["fresh-1"]).toMatchObject({ key: "g", kind: "group" });
    expect(state.nodes.a?.parentId).toBe("fresh-1");
    expect(state.edges.e).toMatchObject({ source: "fresh-1", target: "a" });
  });

  it("never reuses a step number: an added step whose number is taken gets the next free one", () => {
    const current = stateOf([node("x", { number: 2 })], [], 7);
    const version = stateOf([node("x", { number: 2 }), node("y", { number: 2 })]);
    const { state } = restore(current, version);

    expect(state.nodes.y?.number).toBe(7);
    expect(state.nextNumber).toBe(8);
  });

  it("restores the layout setting with its manual arrangement re-keyed to the restored ids", () => {
    const current = sampleState();
    const layout: DiagramLayout = {
      engine: "layered",
      direction: "TB",
      manual: {
        nodes: { "v-c": { x: 1, y: 2, width: 3, height: 4 }, lost: { x: 0, y: 0, width: 1, height: 1 } },
        edges: { "v-bc": { sourceSide: null, targetSide: null, points: [] } },
      },
    };
    const version: DocumentState = {
      ...stateOf(
        Object.values(current.nodes).map((entry) => ({
          ...entry,
          id: `v-${entry.id}`,
          parentId: entry.parentId && `v-${entry.parentId}`,
        })),
        Object.values(current.edges).map((entry) => ({
          ...entry,
          id: `v-${entry.id}`,
          source: `v-${entry.source}`,
          target: `v-${entry.target}`,
        })),
      ),
      layout,
    };
    const { state } = restore(current, version);

    expect(state.layout?.manual).toEqual({
      nodes: { c: { x: 1, y: 2, width: 3, height: 4 } },
      edges: { bc: { sourceSide: null, targetSide: null, points: [] } },
    });
    expect(restore({ ...current, layout }, current).state.layout).toBeNull();
  });

  it("is one undo step, and undo brings the document back", () => {
    const before = sampleState();
    const version = without(before, ["g", "a", "b"]);
    const { state: after } = restore(before, version);
    const entry = diffStates(before, after);
    if (!entry) throw new Error("the restore changed nothing");
    const undo = step(recordEntry(EMPTY_HISTORY, entry), after, "undo");
    const undone = undo.op ? applyOperation(after, undo.op).state : after;

    expect(undo.history.past).toHaveLength(0);
    expect(diffDocuments(before, undone).identical).toBe(true);
  });

  it("leaves a collaborator's concurrent edit to something the version does not touch alone", () => {
    const version = sampleState();
    const current = without(version, ["c"]);
    const op = restoreOperation(current, version);
    if (!op) throw new Error("expected an operation");
    // Ben edits step "a" on the server before the restore arrives there.
    const server = applyOperation(current, {
      type: "node.update",
      id: "a",
      fields: { data: { text: "Ben's text" } },
    }).state;
    const result = applyOperation(server, op);

    expect(result.skipped).toBe(0);
    expect(result.state.nodes.a?.data.text).toBe("Ben's text");
    expect(result.state.nodes.c).toEqual(version.nodes.c);
  });
});

// Property: whatever the current document and the version look like, applying
// the restore never skips anything and leaves a document that shows exactly
// the version (compared by stable key).

const KINDS: readonly NodeKind[] = ["group", "group", "step", "note", "decision"];

function randomDocument(random: ReturnType<typeof seededRandom>, pool: number, idPrefix: string): DocumentState {
  const nodes: DiagramNode[] = [];
  for (let index = 0; index < pool; index += 1) {
    if (random.next() < 0.35) continue;
    const groups = nodes.filter((entry) => entry.kind === "group");
    nodes.push(
      node(`${idPrefix}${String(index)}`, {
        key: `k${String(index)}`,
        number: index + 1,
        kind: random.pick(KINDS),
        parentId: groups.length > 0 && random.next() < 0.5 ? random.pick(groups).id : null,
        position: { x: random.int(500), y: random.int(500) },
        z: random.int(5),
        data: random.next() < 0.5 ? { text: `t${String(random.int(3))}` } : { text: "x", extra: random.int(2) },
        style: random.next() < 0.5 ? {} : { fill: random.pick(["#ffffff", "#fde68a"]) },
      }),
    );
  }
  const edges = [];
  for (let index = 0; index < pool && nodes.length > 1; index += 1) {
    if (random.next() < 0.5) continue;
    edges.push(
      edge(`${idPrefix}e${String(index)}`, random.pick(nodes).id, random.pick(nodes).id, {
        key: `ke${String(index)}`,
        label: random.next() < 0.3 ? { text: "yes" } : null,
      }),
    );
  }
  return stateOf(nodes, edges, pool + 1);
}

describe("restoreOperation, property", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    "restores any version exactly, with nothing skipped (seed %i)",
    (seed) => {
      const random = seededRandom(seed);
      for (let round = 0; round < 25; round += 1) {
        const current = randomDocument(random, 12, "n");
        // Half the versions share the current ids, half come from a copy with other ids.
        const version = randomDocument(random, 12, random.next() < 0.5 ? "n" : "copy");
        const { state, skipped } = restore(current, version);

        expect(skipped).toBe(0);
        expect(diffDocuments(version, state).identical).toBe(true);
        expect(state.nextNumber).toBeGreaterThanOrEqual(current.nextNumber);
      }
    },
  );
});
