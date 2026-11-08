import { describe, expect, it, vi } from "vitest";
import { applyOperation } from "../document/operations";
import { node, stateOf } from "../test/fixtures";
import { easeInOut, framesAt, playTravels, travels, type AnimationClock } from "./layoutAnimation";

function fakeClock() {
  let time = 0;
  const queue = new Map<number, () => void>();
  let next = 0;
  const clock: AnimationClock = {
    now: () => time,
    request: (callback) => {
      next += 1;
      queue.set(next, callback);
      return next;
    },
    cancel: (handle) => {
      queue.delete(handle);
    },
  };
  const advance = (ms: number) => {
    time += ms;
    const callbacks = [...queue.values()];
    queue.clear();
    for (const callback of callbacks) callback();
  };
  return { clock, advance, pending: () => queue.size };
}

const before = stateOf([
  node("a", { position: { x: 0, y: 0 } }),
  node("b", { number: 2, position: { x: 10, y: 10 } }),
  node("c", { number: 3 }),
]);
const after = applyOperation(before, {
  type: "batch",
  ops: [
    { type: "node.update", id: "a", fields: { position: { x: 100, y: 200 } } },
    { type: "node.update", id: "b", fields: { size: { width: 300, height: 50 } } },
    { type: "node.update", id: "c", fields: { z: 9 } },
  ],
}).state;

describe("layout animation", () => {
  it("eases in and out", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.25)).toBeCloseTo(0.0625);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(0.75)).toBeCloseTo(0.9375);
    expect(easeInOut(1)).toBe(1);
  });

  it("finds the nodes whose box changed", () => {
    const paths = travels(before, after);
    expect(Object.keys(paths)).toEqual(["a", "b"]);
    expect(paths.a).toEqual({
      from: { position: { x: 0, y: 0 }, size: { width: 100, height: 50 } },
      to: { position: { x: 100, y: 200 }, size: { width: 100, height: 50 } },
    });
  });

  it("interpolates positions and sizes", () => {
    const frames = framesAt(travels(before, after), 0.5);
    expect(frames.a).toEqual({ position: { x: 50, y: 100 }, size: { width: 100, height: 50 } });
    expect(frames.b?.size).toEqual({ width: 200, height: 50 });
  });

  it("plays the frames and clears every live field at the end", () => {
    const { clock, advance } = fakeClock();
    const show = vi.fn();
    const done = vi.fn();
    playTravels(travels(before, after), show, done, { clock, duration: 400 });
    expect(show).toHaveBeenLastCalledWith(framesAt(travels(before, after), 0));
    advance(200);
    expect(show).toHaveBeenLastCalledWith(framesAt(travels(before, after), 0.5));
    advance(250);
    expect(show).toHaveBeenLastCalledWith({ a: null, b: null });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("stops at once when cancelled, and finishes immediately with nothing to move", () => {
    const { clock, advance, pending } = fakeClock();
    const show = vi.fn();
    const done = vi.fn();
    const stop = playTravels(travels(before, after), show, done, { clock });
    stop();
    expect(show).toHaveBeenLastCalledWith({ a: null, b: null });
    expect(pending()).toBe(0);
    stop();
    advance(500);
    expect(done).toHaveBeenCalledTimes(1);
    const idle = vi.fn();
    playTravels({}, show, idle, { clock })();
    expect(idle).toHaveBeenCalledTimes(1);
  });
});
