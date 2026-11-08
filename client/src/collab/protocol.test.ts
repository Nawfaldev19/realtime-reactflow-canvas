import { describe, expect, it } from "vitest";
import type { Operation } from "../document/operations";
import { edge, node } from "../test/fixtures";
import {
  decodeOperation,
  encodeOperation,
  MAX_DEPTH,
  MAX_LEAVES,
  normalizeOperation,
  parseOpMessage,
  parseServerMessage,
} from "./protocol";

const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("encodeOperation and decodeOperation", () => {
  it("round-trips every operation type through JSON", () => {
    const ops: Operation[] = [
      { type: "node.add", node: node("a") },
      { type: "node.update", id: "a", fields: { position: { x: 1, y: 2 }, parentId: null } },
      { type: "node.remove", id: "a" },
      { type: "edge.add", edge: edge("e", "a", "b") },
      { type: "edge.update", id: "e", fields: { label: null } },
      { type: "edge.remove", id: "e" },
      { type: "layout.set", layout: null },
      {
        type: "batch",
        ops: [
          { type: "node.remove", id: "a" },
          { type: "batch", ops: [] },
        ],
      },
    ];
    for (const op of ops) expect(decodeOperation(json(encodeOperation(op)))).toEqual(op);
  });

  it("sends a removed data key as null and turns it back into a removal", () => {
    const op: Operation = { type: "node.update", id: "a", fields: { data: { text: "Cut", color: undefined } } };
    const wire = json(encodeOperation({ type: "batch", ops: [op] }));

    expect(wire).toEqual({
      type: "batch",
      ops: [{ type: "node.update", id: "a", fields: { data: { text: "Cut", color: null } } }],
    });
    const decoded = decodeOperation(wire);
    expect(decoded).toEqual({
      type: "batch",
      ops: [{ type: "node.update", id: "a", fields: { data: { text: "Cut", color: undefined } } }],
    });
    const [inner] = decoded?.type === "batch" ? decoded.ops : [];
    expect(inner?.type === "node.update" ? Object.keys(inner.fields.data ?? {}) : []).toContain("color");
  });

  it("normalizes an operation to what peers will receive", () => {
    const op = {
      type: "node.update",
      id: "a",
      fields: { position: { x: 1, y: 2 }, size: undefined },
    } as unknown as Operation;

    expect(normalizeOperation(op)).toEqual({ type: "node.update", id: "a", fields: { position: { x: 1, y: 2 } } });
    expect("size" in (normalizeOperation(op) as { fields: object }).fields).toBe(false);
  });

  it("keeps an operation that cannot be expressed in the wire format as it is", () => {
    const op = { type: "node.remove", id: "not an id" } as Operation;

    expect(normalizeOperation(op)).toBe(op);
  });

  // The same rules as server/app/services/operation_shape.rb.
  it("rejects what the server's operation check rejects", () => {
    const bad: unknown[] = [
      null,
      "node.add",
      { type: "node.explode" },
      { type: "node.remove", id: "a b" },
      { type: "node.remove" },
      { type: "node.add", node: { id: 3 } },
      { type: "edge.add", edge: null },
      { type: "node.update", id: "a", fields: { id: "b" } },
      { type: "edge.update", id: "e", fields: { data: {} } },
      { type: "node.update", id: "a", fields: [] },
      { type: "node.update", fields: {} },
      { type: "node.update", id: "a", fields: { data: "text" } },
      { type: "layout.set" },
      { type: "layout.set", layout: "dagre" },
      { type: "batch", ops: {} },
      { type: "batch", ops: [42] },
      { type: "batch", ops: [{ type: "node.remove", id: "a" }, { type: "nope" }] },
    ];
    for (const raw of bad) expect(decodeOperation(raw)).toBeNull();
  });

  it("limits nesting depth and the number of changes", () => {
    const nest = (levels: number): unknown =>
      levels === 0 ? { type: "node.remove", id: "a" } : { type: "batch", ops: [nest(levels - 1)] };

    expect(decodeOperation(nest(MAX_DEPTH))).not.toBeNull();
    expect(decodeOperation(nest(MAX_DEPTH + 1))).toBeNull();
    const wide = (count: number) => ({
      type: "batch",
      ops: Array.from({ length: count }, () => ({ type: "edge.remove", id: "e" })),
    });
    expect(decodeOperation(wide(MAX_LEAVES))).not.toBeNull();
    expect(decodeOperation(wide(MAX_LEAVES + 1))).toBeNull();
  });
});

describe("parseServerMessage", () => {
  const you = { sessionId: "tab-1", memberId: "7", name: "Ada Okafor" };
  const opMessage = {
    type: "op",
    seq: 4,
    sessionId: "tab-2",
    clientOpId: "3",
    memberId: 9,
    op: { type: "node.remove", id: "a" },
  };

  it("parses an ordered operation, with the member id as a string", () => {
    expect(parseOpMessage(opMessage)).toEqual({ ...opMessage, memberId: "9" });
    expect(parseOpMessage({ ...opMessage, seq: 1.5 })).toBeNull();
    expect(parseOpMessage({ ...opMessage, op: { type: "nope" } })).toBeNull();
    expect(parseOpMessage({ ...opMessage, clientOpId: 3 })).toBeNull();
    expect(parseOpMessage({ ...opMessage, type: "ack" })).toBeNull();
  });

  it("parses both kinds of sync reply", () => {
    expect(
      parseServerMessage({
        type: "sync",
        mode: "ops",
        revision: 4,
        enabled: true,
        canEdit: true,
        you,
        resume: "token",
        ops: [opMessage],
      }),
    ).toEqual({
      type: "sync",
      mode: "ops",
      revision: 4,
      enabled: true,
      canEdit: true,
      you,
      resume: "token",
      ops: [{ ...opMessage, memberId: "9" }],
    });
    expect(
      parseServerMessage({ type: "sync", mode: "snapshot", revision: 2, enabled: false, you, document: { nodes: [] } }),
    ).toEqual({
      type: "sync",
      mode: "snapshot",
      revision: 2,
      enabled: false,
      canEdit: false,
      you,
      resume: null,
      document: { nodes: [] },
    });
  });

  it("refuses malformed sync replies", () => {
    expect(parseServerMessage({ type: "sync", mode: "ops", revision: 4, you, ops: [{ type: "op" }] })).toBeNull();
    expect(parseServerMessage({ type: "sync", mode: "ops", revision: 4, you, ops: "all" })).toBeNull();
    expect(parseServerMessage({ type: "sync", mode: "diff", revision: 4, you })).toBeNull();
    expect(parseServerMessage({ type: "sync", mode: "ops", revision: "4", you, ops: [] })).toBeNull();
    expect(
      parseServerMessage({ type: "sync", mode: "ops", revision: 4, you: { sessionId: "a b" }, ops: [] }),
    ).toBeNull();
    expect(parseServerMessage({ type: "sync", mode: "ops", revision: 4, ops: [] })).toBeNull();
  });

  it("parses server errors, with a default message", () => {
    expect(parseServerMessage({ type: "error", message: "Busy" })).toEqual({ type: "error", message: "Busy" });
    expect(parseServerMessage({ type: "error" })).toEqual({
      type: "error",
      message: "The server could not handle this request",
    });
  });

  it("parses rejections, acknowledgements and the collaboration switch", () => {
    expect(parseServerMessage({ type: "rejected", clientOpId: "1", code: "FORBIDDEN", message: "No" })).toEqual({
      type: "rejected",
      clientOpId: "1",
      code: "FORBIDDEN",
      message: "No",
    });
    expect(parseServerMessage({ type: "rejected", clientOpId: "1", code: "TOO_LARGE" })).toMatchObject({
      message: "TOO_LARGE",
    });
    expect(parseServerMessage({ type: "rejected", clientOpId: null, code: "INVALID" })).toBeNull();
    expect(parseServerMessage({ type: "ack", clientOpId: "1", seq: 3 })).toEqual({
      type: "ack",
      clientOpId: "1",
      seq: 3,
    });
    expect(parseServerMessage({ type: "ack", clientOpId: "1" })).toBeNull();
    expect(parseServerMessage({ type: "collaboration", enabled: false, by: "Ada Okafor" })).toEqual({
      type: "collaboration",
      enabled: false,
      by: "Ada Okafor",
    });
    expect(parseServerMessage({ type: "collaboration", enabled: true })).toMatchObject({ by: "Someone" });
    expect(parseServerMessage({ type: "collaboration" })).toBeNull();
  });

  it("parses version announcements", () => {
    expect(parseServerMessage({ type: "versions", number: 4, by: "Ben Lindqvist" })).toEqual({
      type: "versions",
      number: 4,
      by: "Ben Lindqvist",
    });
    expect(parseServerMessage({ type: "versions", number: 2 })).toMatchObject({ by: "Someone" });
    expect(parseServerMessage({ type: "versions", number: "4" })).toBeNull();
  });

  it("parses presence, cleaning the cursor and the node id", () => {
    expect(
      parseServerMessage({
        type: "presence",
        event: "update",
        ...you,
        cursor: { x: 1, y: 2 },
        nodeId: "n1",
        editing: true,
      }),
    ).toEqual({
      type: "presence",
      event: "update",
      ...you,
      cursor: { x: 1, y: 2 },
      nodeId: "n1",
      editing: true,
    });
    expect(
      parseServerMessage({ type: "presence", event: "join", ...you, cursor: { x: "1" }, nodeId: "<b>" }),
    ).toMatchObject({ cursor: null, nodeId: null, editing: false });
    expect(parseServerMessage({ type: "presence", event: "wave", ...you })).toBeNull();
    expect(parseServerMessage({ type: "presence", event: "join", sessionId: "tab-1", name: "Ada" })).toBeNull();
  });

  it("ignores anything else", () => {
    for (const raw of [null, [], "op", { type: "welcome" }]) expect(parseServerMessage(raw)).toBeNull();
  });
});
