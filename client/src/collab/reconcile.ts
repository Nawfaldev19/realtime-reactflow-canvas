import { applyAll, applyOperation, jsonEqual, type Operation } from "../document/operations";
import type { DocumentState } from "../document/types";
import type { OpMessage } from "./protocol";

// Keeps a collaborating editor's copy consistent with the server's order.
//
// The editor holds two documents:
// - `confirmed`: the server's document at the last applied sequence number;
// - `visible`: what the person sees, always equal to `confirmed` with the
//   pending (sent but not yet acknowledged) local operations applied on top.
//
// A remote operation is applied to `confirmed`, and the pending operations are
// replayed on top of it (a rebase), so a local edit never hides a remote one
// and nothing is lost. The editor's own echo is applied to `confirmed` and
// leaves the pending queue; when it was the oldest pending operation, the
// visible document is already right and is returned unchanged, so receiving
// one's own echo costs no re-render. Because every client and the server apply
// the same operations in the same order with the same rules, all copies
// converge once the queues drain.

/** A local operation not yet acknowledged by the server (or, in autosave mode, not yet saved). */
export interface PendingOperation {
  /** The session's local sequence number; also the client operation id on the wire. */
  readonly seq: number;
  readonly op: Operation;
}

export interface Replica {
  readonly confirmed: DocumentState;
  readonly visible: DocumentState;
  readonly pending: readonly PendingOperation[];
}

export interface ReceiveResult {
  readonly replica: Replica;
  /** Local sequence numbers of the pending operations these messages acknowledged. */
  readonly acknowledged: readonly number[];
  /** Operations from other sessions among the messages. */
  readonly remote: number;
}

export const clientOpIdOf = (seq: number): string => String(seq);

/**
 * Keeps the previous object for every node and edge that is unchanged in
 * value, so the canvas does not re-render them after a rebase.
 */
export function shareUnchanged(previous: DocumentState, next: DocumentState): DocumentState {
  const share = <T>(
    before: Readonly<Record<string, T>>,
    after: Readonly<Record<string, T>>,
  ): Readonly<Record<string, T>> => {
    if (before === after) return after;
    const result: Record<string, T> = {};
    let identical = Object.keys(before).length === Object.keys(after).length;
    for (const [id, entity] of Object.entries(after)) {
      const old = before[id];
      const kept = old !== undefined && (old === entity || jsonEqual(old, entity)) ? old : entity;
      result[id] = kept;
      if (kept !== old) identical = false;
    }
    return identical ? before : result;
  };
  const nodes = share(previous.nodes, next.nodes);
  const edges = share(previous.edges, next.edges);
  const layout = jsonEqual(previous.layout ?? null, next.layout ?? null) ? previous.layout : next.layout;
  if (
    nodes === previous.nodes &&
    edges === previous.edges &&
    layout === previous.layout &&
    next.nextNumber === previous.nextNumber
  )
    return previous;
  return { ...next, nodes, edges, ...(layout === undefined ? {} : { layout }) };
}

/** `confirmed` with every pending operation replayed on top, sharing what did not change with `previous`. */
export function rebase(
  confirmed: DocumentState,
  pending: readonly PendingOperation[],
  previous: DocumentState,
): DocumentState {
  const replayed =
    pending.length === 0
      ? confirmed
      : applyAll(
          confirmed,
          pending.map((entry) => entry.op),
        ).state;
  return shareUnchanged(previous, replayed);
}

/** Applies ordered server operations (from `sessionId`'s point of view). */
export function receiveOps(replica: Replica, messages: readonly OpMessage[], sessionId: string): ReceiveResult {
  let { confirmed, pending } = replica;
  const acknowledged: number[] = [];
  let remote = 0;
  // The visible copy stays as it is while every message is our own oldest pending operation.
  let inOrderEchoes = true;
  for (const message of messages) {
    confirmed = applyOperation(confirmed, message.op).state;
    const index =
      message.sessionId === sessionId
        ? pending.findIndex((entry) => clientOpIdOf(entry.seq) === message.clientOpId)
        : -1;
    const entry = pending[index];
    if (entry) {
      if (index !== 0) inOrderEchoes = false;
      acknowledged.push(entry.seq);
      pending = pending.filter((candidate) => candidate !== entry);
    } else {
      remote += 1;
      inOrderEchoes = false;
    }
  }
  if (messages.length === 0) return { replica, acknowledged, remote };
  const visible = inOrderEchoes ? replica.visible : rebase(confirmed, pending, replica.visible);
  return { replica: { confirmed, visible, pending }, acknowledged, remote };
}

/** A resync snapshot replaces the confirmed copy; pending operations are replayed on it (and re-sent by the caller). */
export function receiveSnapshot(replica: Replica, confirmed: DocumentState): Replica {
  return { confirmed, pending: replica.pending, visible: rebase(confirmed, replica.pending, replica.visible) };
}

/** Removes one pending operation the server refused (or already had) and shows the result without it. */
export function dropPending(replica: Replica, seq: number): Replica {
  if (!replica.pending.some((entry) => entry.seq === seq)) return replica;
  const pending = replica.pending.filter((entry) => entry.seq !== seq);
  return { confirmed: replica.confirmed, pending, visible: rebase(replica.confirmed, pending, replica.visible) };
}
