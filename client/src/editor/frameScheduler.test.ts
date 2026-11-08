import { describe, expect, it, vi } from "vitest";
import { createFrameScheduler } from "./frameScheduler";

function fakeFrames() {
  const callbacks = new Map<number, () => void>();
  let next = 1;
  return {
    request: (callback: () => void) => {
      callbacks.set(next, callback);
      return next++;
    },
    cancel: (handle: number) => callbacks.delete(handle),
    tick: () => {
      const due = [...callbacks.values()];
      callbacks.clear();
      for (const callback of due) callback();
    },
    pending: () => callbacks.size,
  };
}

describe("createFrameScheduler", () => {
  it("delivers only the latest value, once per frame", () => {
    const frames = fakeFrames();
    const deliver = vi.fn();
    const scheduler = createFrameScheduler<number>(deliver, frames.request, frames.cancel);
    scheduler.schedule(1);
    scheduler.schedule(2);
    scheduler.schedule(3);
    expect(frames.pending()).toBe(1);
    expect(deliver).not.toHaveBeenCalled();
    frames.tick();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(3);
    frames.tick();
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("flushes a pending value at once and does nothing when idle", () => {
    const frames = fakeFrames();
    const deliver = vi.fn();
    const scheduler = createFrameScheduler<string>(deliver, frames.request, frames.cancel);
    scheduler.flush();
    expect(deliver).not.toHaveBeenCalled();
    scheduler.schedule("a");
    scheduler.flush();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith("a");
    expect(frames.pending()).toBe(0);
  });

  it("cancels a pending value", () => {
    const frames = fakeFrames();
    const deliver = vi.fn();
    const scheduler = createFrameScheduler<string>(deliver, frames.request, frames.cancel);
    scheduler.schedule("a");
    scheduler.cancel();
    frames.tick();
    scheduler.cancel();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("uses the browser's animation frames by default", () => {
    const deliver = vi.fn();
    let queued: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      queued = callback;
      return 7;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const scheduler = createFrameScheduler<number>(deliver);
    scheduler.schedule(5);
    (queued as FrameRequestCallback | null)?.(0);
    expect(deliver).toHaveBeenCalledWith(5);
    scheduler.schedule(6);
    scheduler.cancel();
    expect(cancel).toHaveBeenCalledWith(7);
  });
});
