import type { NodeFields, Operation } from "../document/operations";
import type { Point } from "../document/types";

// The collaboration wire protocol (docs/features/collaboration.md). Operations travel in
// the editor's own format (document/operations.ts). JSON has no `undefined`,
// so a `node.update` data key that the editor removes with `undefined` is sent
// as `null`, and turned back on receipt. `decodeOperation` checks the same
// envelope as the server's OperationShape (known types, ids, bounded
// batches): anything that does not have the operation format is dropped,
// never applied. The server also checks the type of every field before it
// accepts an operation, so what it broadcasts is well typed.

export const LEAF_TYPES = [
  "node.add",
  "node.update",
  "node.remove",
  "edge.add",
  "edge.update",
  "edge.remove",
  "layout.set",
] as const;
const NODE_FIELDS = new Set(["key", "kind", "number", "position", "size", "parentId", "z", "style", "data"]);
const EDGE_FIELDS = new Set(["key", "kind", "source", "target", "sourceSide", "targetSide", "route", "label", "style"]);
export const MAX_DEPTH = 8;
export const MAX_LEAVES = 20_000;

const IDENTIFIER = /^[\w-]{1,64}$/;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isIdentifier = (value: unknown): value is string => typeof value === "string" && IDENTIFIER.test(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Who this tab is in the room, as the server knows it. The server mints the session id. */
export interface Identity {
  readonly sessionId: string;
  readonly memberId: string;
  readonly name: string;
}

/** One ordered operation, as broadcast to every subscriber (the sender included). */
export interface OpMessage {
  readonly type: "op";
  readonly seq: number;
  readonly sessionId: string;
  readonly clientOpId: string;
  readonly memberId: string;
  readonly op: Operation;
}

interface SyncBase {
  readonly type: "sync";
  /** The sequence number the reply brings the client to. */
  readonly revision: number;
  readonly enabled: boolean;
  readonly you: Identity;
  readonly canEdit: boolean;
  /** Sent back with the next join to keep this session after a reconnect; never shared with peers. */
  readonly resume: string | null;
}

export type SyncMessage =
  | (SyncBase & { readonly mode: "ops"; readonly ops: readonly OpMessage[] })
  | (SyncBase & { readonly mode: "snapshot"; readonly document: unknown });

export interface RejectedMessage {
  readonly type: "rejected";
  readonly clientOpId: string;
  readonly code: string;
  readonly message: string;
}

/** A re-sent operation the server already had. */
export interface AckMessage {
  readonly type: "ack";
  readonly clientOpId: string;
  readonly seq: number;
}

export interface PresenceMessage extends Identity {
  readonly type: "presence";
  readonly event: "join" | "update" | "leave";
  readonly cursor: Point | null;
  readonly nodeId: string | null;
  readonly editing: boolean;
}

export interface CollaborationMessage {
  readonly type: "collaboration";
  readonly enabled: boolean;
  readonly by: string;
}

/** Someone saved a version: open history panels offer a refresh. */
export interface VersionsMessage {
  readonly type: "versions";
  readonly number: number;
  readonly by: string;
}

/** The server could not handle a request (other than a submit, which is answered with "rejected"). */
export interface ErrorMessage {
  readonly type: "error";
  readonly message: string;
}

export type ServerMessage =
  | OpMessage
  | SyncMessage
  | RejectedMessage
  | AckMessage
  | PresenceMessage
  | CollaborationMessage
  | VersionsMessage
  | ErrorMessage;

/** What the client sends with the `presence` action (`join` sends `lastSeq` and `resume`, `submit` sends `clientOpId` and `op`). */
export interface PresenceRequest {
  readonly cursor: Point | null;
  readonly nodeId: string | null;
  readonly editing: boolean;
}

/** The JSON form of an operation: removed data keys become null. */
export function encodeOperation(op: Operation): unknown {
  switch (op.type) {
    case "batch":
      return { type: "batch", ops: op.ops.map(encodeOperation) };
    case "node.update": {
      if (!op.fields.data) return op;
      const data = Object.fromEntries(
        Object.entries(op.fields.data).map(([key, value]) => [key, value === undefined ? null : value]),
      );
      return { ...op, fields: { ...op.fields, data } };
    }
    default:
      return op;
  }
}

function fieldsProblem(raw: Json, allowed: ReadonlySet<string>): boolean {
  if (!isIdentifier(raw.id) || !isRecord(raw.fields)) return true;
  if (Object.keys(raw.fields).some((key) => !allowed.has(key))) return true;
  return "data" in raw.fields && !isRecord(raw.fields.data);
}

function leafProblem(raw: Json): boolean {
  switch (raw.type) {
    case "node.add":
      return !isRecord(raw.node) || !isIdentifier(raw.node.id);
    case "edge.add":
      return !isRecord(raw.edge) || !isIdentifier(raw.edge.id);
    case "node.update":
      return fieldsProblem(raw, NODE_FIELDS);
    case "edge.update":
      return fieldsProblem(raw, EDGE_FIELDS);
    case "layout.set":
      return !("layout" in raw) || !(raw.layout === null || isRecord(raw.layout));
    default:
      return !isIdentifier(raw.id);
  }
}

function decodeNode(raw: Json, depth: number, leaves: { count: number }): Operation | null {
  if (raw.type === "batch") {
    if (depth >= MAX_DEPTH || !Array.isArray(raw.ops)) return null;
    const ops: Operation[] = [];
    for (const inner of raw.ops as unknown[]) {
      const decoded = isRecord(inner) ? decodeNode(inner, depth + 1, leaves) : null;
      if (!decoded) return null;
      ops.push(decoded);
    }
    return { type: "batch", ops };
  }
  if (!(LEAF_TYPES as readonly unknown[]).includes(raw.type) || leafProblem(raw)) return null;
  leaves.count += 1;
  if (raw.type === "node.update") {
    const fields = raw.fields as Json;
    if (isRecord(fields.data)) {
      const data = Object.fromEntries(
        Object.entries(fields.data).map(([key, value]) => [key, value === null ? undefined : value]),
      );
      return { type: "node.update", id: raw.id as string, fields: { ...(fields as NodeFields), data } };
    }
  }
  return raw as unknown as Operation;
}

/** The operation a JSON value describes, or null when it does not have the operation format. */
export function decodeOperation(raw: unknown): Operation | null {
  const leaves = { count: 0 };
  const op = isRecord(raw) ? decodeNode(raw, 0, leaves) : null;
  return op && leaves.count <= MAX_LEAVES ? op : null;
}

/**
 * The operation exactly as the server and every peer will see it. The editor
 * applies this form locally, so its own copy never differs from theirs by a
 * value JSON cannot carry.
 */
export function normalizeOperation(op: Operation): Operation {
  return decodeOperation(JSON.parse(JSON.stringify(encodeOperation(op)))) ?? op;
}

function parsePoint(value: unknown): Point | null {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) ? { x: value.x, y: value.y } : null;
}

function parseIdentity(raw: Json): Identity | null {
  return isIdentifier(raw.sessionId) && typeof raw.memberId === "string" && typeof raw.name === "string"
    ? { sessionId: raw.sessionId, memberId: raw.memberId, name: raw.name }
    : null;
}

export function parseOpMessage(raw: unknown): OpMessage | null {
  if (
    !isRecord(raw) ||
    raw.type !== "op" ||
    !Number.isInteger(raw.seq) ||
    !isIdentifier(raw.sessionId) ||
    typeof raw.clientOpId !== "string"
  )
    return null;
  const op = decodeOperation(raw.op);
  if (!op) return null;
  return {
    type: "op",
    seq: raw.seq as number,
    sessionId: raw.sessionId,
    clientOpId: raw.clientOpId,
    memberId: String(raw.memberId),
    op,
  };
}

function parseSync(raw: Json): SyncMessage | null {
  const you = isRecord(raw.you) ? parseIdentity(raw.you) : null;
  if (!you || !Number.isInteger(raw.revision)) return null;
  const base = {
    type: "sync" as const,
    revision: raw.revision as number,
    enabled: raw.enabled === true,
    you,
    canEdit: raw.canEdit === true,
    resume: typeof raw.resume === "string" ? raw.resume : null,
  };
  if (raw.mode === "snapshot") return { ...base, mode: "snapshot", document: raw.document };
  if (raw.mode !== "ops" || !Array.isArray(raw.ops)) return null;
  const ops = (raw.ops as unknown[]).map(parseOpMessage);
  return ops.every((op) => op !== null) ? { ...base, mode: "ops", ops } : null;
}

function parsePresence(raw: Json): PresenceMessage | null {
  const identity = parseIdentity(raw);
  if (!identity || (raw.event !== "join" && raw.event !== "update" && raw.event !== "leave")) return null;
  return {
    type: "presence",
    event: raw.event,
    ...identity,
    cursor: parsePoint(raw.cursor),
    nodeId: isIdentifier(raw.nodeId) ? raw.nodeId : null,
    editing: raw.editing === true,
  };
}

/** A message from the server, or null for anything malformed. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!isRecord(raw)) return null;
  switch (raw.type) {
    case "op":
      return parseOpMessage(raw);
    case "sync":
      return parseSync(raw);
    case "rejected":
      return typeof raw.clientOpId === "string" && typeof raw.code === "string"
        ? {
            type: "rejected",
            clientOpId: raw.clientOpId,
            code: raw.code,
            message: typeof raw.message === "string" ? raw.message : raw.code,
          }
        : null;
    case "ack":
      return typeof raw.clientOpId === "string" && Number.isInteger(raw.seq)
        ? { type: "ack", clientOpId: raw.clientOpId, seq: raw.seq as number }
        : null;
    case "presence":
      return parsePresence(raw);
    case "collaboration":
      return typeof raw.enabled === "boolean"
        ? { type: "collaboration", enabled: raw.enabled, by: typeof raw.by === "string" ? raw.by : "Someone" }
        : null;
    case "versions":
      return Number.isInteger(raw.number)
        ? { type: "versions", number: raw.number as number, by: typeof raw.by === "string" ? raw.by : "Someone" }
        : null;
    case "error":
      return {
        type: "error",
        message: typeof raw.message === "string" ? raw.message : "The server could not handle this request",
      };
    default:
      return null;
  }
}
