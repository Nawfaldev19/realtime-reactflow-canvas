import { describe, expect, it } from "vitest";
import { edge, node, sampleState, sequentialIds, stateOf } from "../test/fixtures";
import {
  CLIPBOARD_VERSION,
  copyPayload,
  duplicateTarget,
  parseClipboard,
  pasteOperation,
  serializeClipboard,
} from "./clipboard";
import { absoluteBox } from "./groups";
import { applyOperation } from "./operations";

describe("copyPayload", () => {
  it("copies a group with its children and only the internal connectors", () => {
    const payload = copyPayload(sampleState(), ["g"]);
    expect(payload?.nodes.map((entry) => entry.id)).toEqual(["g", "a", "b"]);
    expect(payload?.edges.map((entry) => entry.id)).toEqual(["ab"]);
    // The group is the copy's top-left corner; children keep their group-relative positions.
    expect(payload?.nodes[0]).toMatchObject({ parentId: null, position: { x: 0, y: 0 } });
    expect(payload?.nodes[1]).toMatchObject({ parentId: "g", position: { x: 20, y: 40 } });
  });

  it("copies 3 steps with 2 internal connectors and leaves the one to an outside step (acceptance)", () => {
    const state = stateOf(
      [
        node("p", { position: { x: 10, y: 10 } }),
        node("q", { number: 2, position: { x: 200, y: 50 } }),
        node("r", { number: 3, position: { x: 60, y: 300 } }),
        node("out", { number: 4 }),
      ],
      [edge("pq", "p", "q"), edge("qr", "q", "r"), edge("ro", "r", "out")],
    );
    const payload = copyPayload(state, ["p", "q", "r"]);
    expect(payload?.nodes).toHaveLength(3);
    expect(payload?.edges.map((entry) => entry.id)).toEqual(["pq", "qr"]);
    const pasted = pasteOperation(
      state,
      payload ?? { version: 1, nodes: [], edges: [] },
      { x: 1000, y: 1000 },
      { newId: sequentialIds("new") },
    );
    expect(pasted.nodeIds).toHaveLength(3);
    expect(pasted.edgeIds).toHaveLength(2);
  });

  it("returns null without existing nodes and lifts a selected child out of its group", () => {
    expect(copyPayload(sampleState(), ["missing"])).toBeNull();
    const payload = copyPayload(sampleState(), ["a", "c"]);
    expect(payload?.nodes.find((entry) => entry.id === "a")).toMatchObject({
      parentId: null,
      position: { x: 0, y: 40 },
    });
    expect(payload?.nodes.find((entry) => entry.id === "c")?.position).toEqual({ x: 480, y: 0 });
  });
});

describe("pasteOperation", () => {
  it("remaps ids, parents and connector ends, continues numbers and stacks on top", () => {
    const state = sampleState();
    const payload = copyPayload(state, ["g"]);
    if (!payload) throw new Error("expected a payload");
    const { op, nodeIds, edgeIds } = pasteOperation(
      state,
      payload,
      { x: 700, y: 400 },
      { newId: sequentialIds("new") },
    );
    const after = applyOperation(state, op).state;
    expect(nodeIds).toEqual(["new-1", "new-2", "new-3"]);
    expect(edgeIds).toEqual(["new-4"]);
    const pastedGroup = after.nodes["new-1"];
    expect(pastedGroup).toMatchObject({ key: "new-1", parentId: null, position: { x: 700, y: 400 }, number: 5 });
    // Pasted children belong to the pasted group, at the same relative place.
    expect(after.nodes["new-2"]).toMatchObject({ parentId: "new-1", position: { x: 20, y: 40 }, number: 6 });
    expect(after.edges["new-4"]).toMatchObject({ source: "new-2", target: "new-3", key: "new-4" });
    expect(Math.min(...nodeIds.map((id) => after.nodes[id]?.z ?? 0))).toBeGreaterThan(4);
    // No pasted id equals an existing id, and nothing was skipped.
    expect(Object.keys(after.nodes)).toHaveLength(7);
  });

  it("parents the top-level nodes to the group under the pointer", () => {
    const state = sampleState();
    const payload = copyPayload(state, ["c"]);
    if (!payload) throw new Error("expected a payload");
    const { op, nodeIds } = pasteOperation(
      state,
      payload,
      { x: 150, y: 250 },
      { newId: sequentialIds("new"), parentId: "g" },
    );
    const after = applyOperation(state, op).state;
    const [id = ""] = nodeIds;
    expect(after.nodes[id]).toMatchObject({ parentId: "g", position: { x: 50, y: 150 } });
    expect(absoluteBox(after, id)).toMatchObject({ x: 150, y: 250 });
    // A target that is not a group is ignored.
    const loose = pasteOperation(state, payload, { x: 0, y: 0 }, { newId: sequentialIds("x"), parentId: "c" });
    expect(loose.op.ops[0]).toMatchObject({ node: { parentId: null } });
  });
});

describe("clipboard text", () => {
  it("round-trips through text and ignores anything else", () => {
    const payload = copyPayload(sampleState(), ["g"]);
    if (!payload) throw new Error("expected a payload");
    const parsed = parseClipboard(serializeClipboard(payload));
    expect(parsed?.version).toBe(CLIPBOARD_VERSION);
    expect(parsed?.nodes).toEqual(payload.nodes);
    expect(parsed?.edges).toEqual(payload.edges);
    for (const text of [
      "",
      "plain words",
      "[]",
      "null",
      JSON.stringify({ nodes: [] }),
      JSON.stringify({ liveCanvas: 1, nodes: [], edges: [] }),
    ]) {
      expect(parseClipboard(text)).toBeNull();
    }
  });
});

describe("duplicateTarget", () => {
  it("offsets by 50 and keeps a shared parent", () => {
    expect(duplicateTarget(sampleState(), ["a", "b"])).toEqual({ origin: { x: 170, y: 190 }, parentId: "g" });
    expect(duplicateTarget(sampleState(), ["a", "c"])).toEqual({ origin: { x: 170, y: 150 }, parentId: null });
    expect(duplicateTarget(sampleState(), [])).toBeNull();
  });
});
