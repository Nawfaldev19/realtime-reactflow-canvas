import type { OpMessage } from "./protocol";

// Puts the server's operations back in sequence order. The server numbers
// every accepted operation 1, 2, 3… (the diagram's revision). Broadcasts can
// arrive out of order (the server answers from several threads), twice (a
// resync reply can repeat a broadcast) or not at all (a dropped socket). The
// sequencer releases operations strictly in order, drops what it has already
// released, holds early arrivals in a small buffer, and reports a gap: the
// caller waits a moment for the missing numbers and resynchronizes if they do
// not come (syncMachine.ts), or at once when the buffer overflows. After a
// resync the caller starts a new sequencer at the reply's revision.

export const MAX_BUFFERED = 200;

export interface SequencerState {
  /** The sequence number of the last operation released (applied). */
  readonly lastApplied: number;
  /** Early arrivals by sequence number, all greater than lastApplied + 1. */
  readonly buffer: ReadonlyMap<number, OpMessage>;
}

export interface Gap {
  /** The first missing sequence number. */
  readonly from: number;
  /** The highest number held, so the missing range is [from, to). */
  readonly to: number;
}

export interface OfferResult {
  readonly state: SequencerState;
  /** Operations to apply now, in sequence order. */
  readonly ready: readonly OpMessage[];
  /** The message was already applied or is already buffered. */
  readonly duplicate: boolean;
  /** A missing range is holding back buffered operations, or null. */
  readonly gap: Gap | null;
  /** The buffer is too full to keep waiting: resynchronize now. */
  readonly overflow: boolean;
}

export const startSequencer = (lastApplied: number): SequencerState => ({ lastApplied, buffer: new Map() });

export function gapOf(state: SequencerState): Gap | null {
  if (state.buffer.size === 0) return null;
  return { from: state.lastApplied + 1, to: Math.max(...state.buffer.keys()) };
}

/** Releases every buffered operation that now follows on (`buffer` is a fresh copy, changed in place). */
function drain(lastApplied: number, buffer: Map<number, OpMessage>): { state: SequencerState; ready: OpMessage[] } {
  const ready: OpMessage[] = [];
  let last = lastApplied;
  for (let next = buffer.get(last + 1); next !== undefined; next = buffer.get(last + 1)) {
    ready.push(next);
    buffer.delete(next.seq);
    last = next.seq;
  }
  return { state: { lastApplied: last, buffer }, ready };
}

function result(state: SequencerState, ready: readonly OpMessage[], duplicate: boolean): OfferResult {
  return { state, ready, duplicate, gap: gapOf(state), overflow: state.buffer.size > MAX_BUFFERED };
}

/** Takes one broadcast operation. */
export function offer(state: SequencerState, message: OpMessage): OfferResult {
  if (message.seq <= state.lastApplied || state.buffer.has(message.seq)) return result(state, [], true);
  const buffer = new Map(state.buffer).set(message.seq, message);
  const drained = drain(state.lastApplied, buffer);
  return result(drained.state, drained.ready, false);
}
