import { describe, expect, it } from "vitest";
import { seededRandom } from "../test/random";
import type { OpMessage } from "./protocol";
import { gapOf, MAX_BUFFERED, offer, startSequencer, type SequencerState } from "./sequencer";

const message = (seq: number): OpMessage => ({
  type: "op",
  seq,
  sessionId: "tab",
  clientOpId: String(seq),
  memberId: "1",
  op: { type: "node.remove", id: `n${seq}` },
});
const seqs = (messages: readonly OpMessage[]) => messages.map((entry) => entry.seq);

function feed(state: SequencerState, order: readonly number[]) {
  const released: number[] = [];
  let current = state;
  for (const seq of order) {
    const result = offer(current, message(seq));
    current = result.state;
    released.push(...seqs(result.ready));
  }
  return { state: current, released };
}

describe("offer", () => {
  it("releases the next number at once", () => {
    const result = offer(startSequencer(4), message(5));

    expect(seqs(result.ready)).toEqual([5]);
    expect(result.state.lastApplied).toBe(5);
    expect(result).toMatchObject({ duplicate: false, gap: null, overflow: false });
  });

  it("holds an early arrival and reports the missing range", () => {
    const result = offer(startSequencer(4), message(7));

    expect(result.ready).toEqual([]);
    expect(result.gap).toEqual({ from: 5, to: 7 });
    expect(result.state.lastApplied).toBe(4);
  });

  it("releases held operations in order once the gap fills", () => {
    const { state, released } = feed(startSequencer(0), [3, 2, 1]);

    expect(released).toEqual([1, 2, 3]);
    expect(state.buffer.size).toBe(0);
    expect(gapOf(state)).toBeNull();
  });

  it("drops operations it already released or already holds", () => {
    const applied = offer(startSequencer(5), message(5));
    expect(applied).toMatchObject({ duplicate: true, ready: [] });
    expect(applied.state).toEqual(startSequencer(5));

    const held = offer(startSequencer(5), message(8)).state;
    const again = offer(held, message(8));
    expect(again.duplicate).toBe(true);
    expect(again.state).toBe(held);
  });

  it("never changes the state it was given", () => {
    const start = offer(startSequencer(0), message(3)).state;
    offer(start, message(1));
    offer(start, message(2));

    expect([...start.buffer.keys()]).toEqual([3]);
    expect(start.lastApplied).toBe(0);
  });

  it("asks for a resync when too many operations wait behind a gap", () => {
    let state = startSequencer(0);
    let overflow = false;
    for (let seq = 2; seq <= MAX_BUFFERED + 2; seq += 1) {
      const result = offer(state, message(seq));
      state = result.state;
      overflow = result.overflow;
    }
    expect(state.buffer.size).toBe(MAX_BUFFERED + 1);
    expect(overflow).toBe(true);
  });

  it("releases every number exactly once, in order, whatever the arrival order and duplicates (property)", () => {
    const random = seededRandom(17);
    for (let round = 0; round < 200; round += 1) {
      const count = 1 + random.int(30);
      const arrivals = Array.from({ length: count }, (_, index) => index + 1);
      for (let index = 0; index < count; index += 1) arrivals.push(1 + random.int(count));
      for (let index = arrivals.length - 1; index > 0; index -= 1) {
        const other = random.int(index + 1);
        [arrivals[index], arrivals[other]] = [arrivals[other] as number, arrivals[index] as number];
      }
      const { state, released } = feed(startSequencer(0), arrivals);

      expect(released).toEqual(Array.from({ length: count }, (_, index) => index + 1));
      expect(state.lastApplied).toBe(count);
      expect(state.buffer.size).toBe(0);
    }
  });
});
