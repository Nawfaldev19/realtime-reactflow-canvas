import { act, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { RevealController, type RevealClock } from "../reveal/controller";
import type { Timeline } from "../reveal/timeline";
import { animations, PATH_LENGTH, runningAnimations } from "../test/animation";
import { renderConnector } from "../test/connector";

// A connector inside a running reveal: hidden, then drawn from its source with
// a growing dash over its measured length, its label fading in halfway, and
// its arrowhead only once the line has arrived.

function manualClock() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  const clock: RevealClock = {
    now: () => now,
    setTimeout: (run, ms) => {
      timers.set(next, { at: now + ms, run });
      return next++;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
  };
  const advanceTo = (time: number) => {
    act(() => {
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = time;
    });
  };
  return { clock, advanceTo };
}

const TIMELINE: Timeline = {
  cues: [
    { kind: "node", id: "a", start: 0, end: 250 },
    { kind: "connectors", source: "a", ids: ["e"], start: 100, labelStart: 300, labelEnd: 450, end: 500 },
    { kind: "node", id: "b", start: 200, end: 450 },
  ],
  total: 500,
  stagger: 100,
};

const group = () => document.querySelector('[data-testid="connector"]');
const line = () => document.querySelector(".connector__line");

function setup() {
  const { clock, advanceTo } = manualClock();
  const reveal = new RevealController(clock);
  renderConnector({ label: { text: "Yes" } }, { selected: false, canEdit: false, reveal });
  return { reveal, advanceTo };
}

describe("connector reveal", () => {
  it("is simply shown outside a running reveal", () => {
    setup();
    expect(group()).toHaveAttribute("data-reveal", "shown");
    expect(line()).toHaveAttribute("marker-end");
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(animations).toEqual([]);
  });

  it("stays hidden, draws from the source, fades the label in halfway and adds the arrowhead at the end", () => {
    const { reveal, advanceTo } = setup();
    act(() => reveal.play(TIMELINE));
    expect(group()).toHaveAttribute("data-reveal", "hidden");
    expect(line()).not.toHaveAttribute("marker-end");
    expect(screen.queryByText("Yes")).not.toBeInTheDocument();

    advanceTo(150);
    expect(group()).toHaveAttribute("data-reveal", "drawing");
    expect(line()).not.toHaveAttribute("marker-end");
    expect(screen.queryByText("Yes")).not.toBeInTheDocument();
    const draw = animations.find((animation) => animation.target === line());
    // Dash and gap grow from L to 2L while the offset stays at L: the visible part grows from 0 to L.
    expect(draw?.keyframes).toEqual([
      { strokeDasharray: `${String(PATH_LENGTH)} ${String(PATH_LENGTH)}`, strokeDashoffset: String(PATH_LENGTH) },
      {
        strokeDasharray: `${String(2 * PATH_LENGTH)} ${String(2 * PATH_LENGTH)}`,
        strokeDashoffset: String(PATH_LENGTH),
      },
    ]);
    expect(draw?.options).toEqual({ duration: 400, easing: "linear" });
    expect(reveal.pending).toBe(2);

    advanceTo(320);
    expect(group()).toHaveAttribute("data-reveal", "labelling");
    const label = screen.getByText("Yes");
    expect(animations.find((animation) => animation.target === label)?.options).toEqual({
      duration: 150,
      easing: "linear",
    });
    // The line keeps drawing through the label fade: still one draw animation, not restarted.
    expect(animations.filter((animation) => animation.target === line())).toHaveLength(1);
    expect(line()).not.toHaveAttribute("marker-end");

    advanceTo(510);
    expect(group()).toHaveAttribute("data-reveal", "shown");
    expect(line()).toHaveAttribute("marker-end");
    expect(runningAnimations()).toEqual([]);
    expect(reveal.pending).toBe(0);
  });

  it("lets a finished animation unregister itself", () => {
    const { reveal, advanceTo } = setup();
    act(() => reveal.play(TIMELINE));
    advanceTo(150);
    const draw = animations.find((animation) => animation.target === line());
    expect(reveal.pending).toBe(2);
    draw?.finish();
    expect(reveal.pending).toBe(1);
  });

  it("cancels the draw and the label fade on skip, showing the final state", () => {
    const { reveal, advanceTo } = setup();
    act(() => reveal.play(TIMELINE));
    advanceTo(320);
    expect(runningAnimations().length).toBe(2);
    act(() => reveal.skip());
    expect(runningAnimations()).toEqual([]);
    expect(group()).toHaveAttribute("data-reveal", "shown");
    expect(line()).toHaveAttribute("marker-end");
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("does not draw a path without length", () => {
    const prototype = SVGElement.prototype as SVGElement & { getTotalLength: () => number };
    const original = prototype.getTotalLength;
    prototype.getTotalLength = () => 0;
    onTestFinished(() => {
      prototype.getTotalLength = original;
    });
    const { reveal, advanceTo } = setup();
    act(() => reveal.play(TIMELINE));
    advanceTo(150);
    expect(group()).toHaveAttribute("data-reveal", "drawing");
    expect(animations.filter((animation) => animation.target === line())).toEqual([]);
  });
});
