import { describe, expect, it, vi } from "vitest";
import { edge, node, stateOf } from "../test/fixtures";
import { RevealController, type RevealClock } from "./controller";
import { revealOrder } from "./order";
import { planReveal, REVEAL_TIMING } from "./timeline";

/** A manual clock that counts pending timers, like a test harness for handles. */
function manualClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: RevealClock = {
    now: () => now,
    setTimeout: (callback, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
  };
  const advanceTo = (time: number) => {
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].callback();
    }
    now = time;
  };
  return { clock, advanceTo, pendingTimers: () => timers.size };
}

const at = (x: number, y: number) => ({ position: { x, y } });
const doc = stateOf(
  [node("a", at(0, 0)), node("b", at(0, 100)), node("c", at(0, 200))],
  [edge("ab", "a", "b", { label: { text: "Yes" } }), edge("bc", "b", "c")],
);
const timeline = planReveal(doc, revealOrder(doc), { ...REVEAL_TIMING, maxTotal: null });

describe("reveal controller", () => {
  it("shows everything before it plays", () => {
    const controller = new RevealController(manualClock().clock);
    expect(controller.currentStatus).toBe("idle");
    expect(controller.nodePhase("a")).toBe("shown");
    expect(controller.connectorPhase("ab")).toBe("shown");
  });

  it("hides every step at t = 0 and shows everything, with arrowheads, at total + 50 ms", () => {
    const { clock, advanceTo } = manualClock();
    const controller = new RevealController(clock);
    controller.play(timeline);
    expect(controller.nodePhase("a")).toBe("fading");
    expect(controller.nodePhase("b")).toBe("hidden");
    expect(controller.nodePhase("c")).toBe("hidden");
    expect(controller.connectorPhase("ab")).toBe("hidden");
    advanceTo(timeline.total + 50);
    expect(controller.currentStatus).toBe("done");
    for (const id of ["a", "b", "c"]) expect(controller.nodePhase(id)).toBe("shown");
    for (const id of ["ab", "bc"]) expect(controller.connectorPhase(id)).toBe("shown");
  });

  it("moves through the phases at the planned times", () => {
    const { clock, advanceTo } = manualClock();
    const controller = new RevealController(clock);
    controller.play(timeline);
    advanceTo(100);
    expect(controller.connectorPhase("ab")).toBe("drawing");
    advanceTo(250);
    expect(controller.nodePhase("a")).toBe("shown");
    advanceTo(300);
    expect(controller.connectorPhase("ab")).toBe("labelling");
    advanceTo(499);
    expect(controller.connectorPhase("ab")).toBe("labelling");
    advanceTo(500);
    expect(controller.connectorPhase("ab")).toBe("shown");
  });

  it("keeps at most one timer pending, and none when done", () => {
    const { clock, advanceTo, pendingTimers } = manualClock();
    const controller = new RevealController(clock);
    controller.play(timeline);
    expect(pendingTimers()).toBe(1);
    expect(controller.pending).toBe(1);
    advanceTo(timeline.total);
    expect(pendingTimers()).toBe(0);
    expect(controller.pending).toBe(0);
  });

  it("catches up on late timers by applying every change that is due", () => {
    const { clock, advanceTo } = manualClock();
    const controller = new RevealController(clock);
    controller.play(timeline);
    // Jump without firing intermediate timers: the next fire applies all changes due by then.
    advanceTo(260);
    expect(controller.nodePhase("a")).toBe("shown");
    expect(controller.nodePhase("b")).toBe("fading");
  });

  it("skips to the final state and cancels the timer and every tracked animation", () => {
    const { clock, advanceTo, pendingTimers } = manualClock();
    const controller = new RevealController(clock);
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.play(timeline);
    advanceTo(120);
    const animation = { cancel: vi.fn() };
    controller.track(animation);
    expect(controller.pending).toBe(2);
    controller.skip();
    expect(animation.cancel).toHaveBeenCalledTimes(1);
    expect(pendingTimers()).toBe(0);
    expect(controller.pending).toBe(0);
    expect(controller.nodePhase("c")).toBe("shown");
    expect(controller.currentStatus).toBe("done");
    expect(listener).toHaveBeenCalled();
    // Skipping again changes nothing.
    const calls = listener.mock.calls.length;
    controller.skip();
    expect(listener.mock.calls.length).toBe(calls);
  });

  it("replays from empty with the same sequence, cancelling the earlier run", () => {
    const { clock, advanceTo, pendingTimers } = manualClock();
    const controller = new RevealController(clock);
    const record = () => ["a", "b", "c"].map((id) => controller.nodePhase(id)).join(",");
    controller.play(timeline);
    advanceTo(300);
    const firstRun = record();
    const animation = { cancel: vi.fn() };
    controller.track(animation);
    controller.play(timeline);
    expect(animation.cancel).toHaveBeenCalled();
    expect(pendingTimers()).toBe(1);
    expect(record()).toBe("fading,hidden,hidden");
    advanceTo(600);
    expect(record()).toBe(firstRun);
  });

  it("replays after a skip", () => {
    const { clock } = manualClock();
    const controller = new RevealController(clock);
    controller.play(timeline);
    controller.skip();
    controller.play(timeline);
    expect(controller.nodePhase("b")).toBe("hidden");
  });

  it("stays idle when stopped or skipped before playing", () => {
    const controller = new RevealController(manualClock().clock);
    controller.skip();
    controller.stop();
    expect(controller.currentStatus).toBe("idle");
  });

  it("cancels animations handed over when no run is active", () => {
    const controller = new RevealController(manualClock().clock);
    const animation = { cancel: vi.fn() };
    controller.track(animation)();
    expect(animation.cancel).toHaveBeenCalledTimes(1);
  });

  it("lets finished animations unregister themselves", () => {
    const controller = new RevealController(manualClock().clock);
    controller.play(timeline);
    const unregister = controller.track({ cancel: vi.fn() });
    expect(controller.pending).toBe(2);
    unregister();
    expect(controller.pending).toBe(1);
  });

  it("leaves nothing pending after stop, publishes nothing for it, and can play again", () => {
    const { clock, pendingTimers } = manualClock();
    const controller = new RevealController(clock);
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.play(timeline);
    const animation = { cancel: vi.fn() };
    controller.track(animation);
    listener.mockClear();
    controller.stop();
    expect(listener).not.toHaveBeenCalled();
    expect(animation.cancel).toHaveBeenCalled();
    expect(pendingTimers()).toBe(0);
    expect(controller.pending).toBe(0);
    expect(controller.nodePhase("c")).toBe("shown");
    controller.play(timeline);
    expect(controller.nodePhase("c")).toBe("hidden");
  });

  it("finishes an empty timeline at once", () => {
    const controller = new RevealController(manualClock().clock);
    controller.play({ cues: [], total: 0, stagger: 100 });
    expect(controller.currentStatus).toBe("done");
  });

  it("shows elements the timeline does not know, such as steps added by a refetch", () => {
    const controller = new RevealController(manualClock().clock);
    controller.play(timeline);
    expect(controller.nodePhase("new")).toBe("shown");
    expect(controller.connectorPhase("new-edge")).toBe("shown");
  });

  it("notifies listeners on every update and lets them unsubscribe", () => {
    const { clock, advanceTo } = manualClock();
    const controller = new RevealController(clock);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.play(timeline);
    unsubscribe();
    advanceTo(timeline.total);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("uses the browser clock by default", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      const controller = new RevealController();
      controller.play(timeline);
      expect(controller.pending).toBe(1);
      vi.advanceTimersByTime(timeline.total + 50);
      expect(controller.currentStatus).toBe("done");
      controller.play(timeline);
      controller.stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
