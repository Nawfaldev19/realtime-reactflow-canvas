import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sketchProps } from "../document/nodeData";
import { renderEditor } from "../test/canvas";
import { node, stateOf } from "../test/fixtures";

const doc = () => stateOf([node("a", { position: { x: 500, y: 500 } })]);

function stroke(overlay: HTMLElement, points: readonly (readonly [number, number])[], pointerId = 1) {
  const [first, ...rest] = points;
  if (!first) return;
  fireEvent.pointerDown(overlay, { clientX: first[0], clientY: first[1], pointerId, button: 0, pressure: 0.5 });
  for (const [x, y] of rest) fireEvent.pointerMove(overlay, { clientX: x, clientY: y, pointerId, pressure: 0.5 });
  fireEvent.pointerUp(overlay, {
    clientX: rest.at(-1)?.[0] ?? first[0],
    clientY: rest.at(-1)?.[1] ?? first[1],
    pointerId,
  });
}

describe("draw mode", () => {
  it("opens from the toolbar and turns a stroke into a sketch node with box-relative samples", async () => {
    const { store } = renderEditor(doc());
    await userEvent.click(screen.getByRole("button", { name: "Draw" }));
    expect(screen.getByRole("button", { name: "Draw" })).toHaveAttribute("aria-pressed", "true");
    const overlay = screen.getByTestId("sketch-overlay");

    fireEvent.pointerDown(overlay, { clientX: 10, clientY: 20, pointerId: 1, button: 0, pressure: 0.5 });
    fireEvent.pointerMove(overlay, { clientX: 60, clientY: 45, pointerId: 1, pressure: 0.5 });
    expect(overlay.querySelector("path")?.getAttribute("d")).toMatch(/^M .* Z$/);
    fireEvent.pointerMove(overlay, { clientX: 110, clientY: 70, pointerId: 1, pressure: 0.5 });
    fireEvent.pointerUp(overlay, { clientX: 110, clientY: 70, pointerId: 1 });

    const sketches = Object.values(store.getState().doc.nodes).filter((entry) => entry.kind === "sketch");
    expect(sketches).toHaveLength(1);
    const [sketch] = sketches;
    if (!sketch) throw new Error("missing sketch");
    // Pad = widest radius 5.25 around the samples' bounds (10, 20)–(110, 70).
    expect(sketch.position).toEqual({ x: 4.75, y: 14.75 });
    expect(sketch.size).toEqual({ width: 110.5, height: 60.5 });
    expect(sketchProps(sketch).points[0]).toEqual({ x: 5.25, y: 5.25, pressure: 0.5 });
    expect(sketchProps(sketch).initialSize).toEqual({ width: 110.5, height: 60.5 });
    expect(overlay.querySelector("path")?.getAttribute("d")).toBe("");
  });

  it("ignores taps, other buttons and stray pointers", async () => {
    const { store } = renderEditor(doc());
    await userEvent.click(screen.getByRole("button", { name: "Draw" }));
    const overlay = screen.getByTestId("sketch-overlay");
    stroke(overlay, [[30, 30]]);
    fireEvent.pointerDown(overlay, { clientX: 0, clientY: 0, button: 2, pointerId: 4 });
    fireEvent.pointerMove(overlay, { clientX: 50, clientY: 50, pointerId: 4 });
    fireEvent.pointerUp(overlay, { clientX: 50, clientY: 50, pointerId: 4 });
    fireEvent.pointerDown(overlay, { clientX: 0, clientY: 0, button: 0, pointerId: 5 });
    fireEvent.pointerMove(overlay, { clientX: 50, clientY: 50, pointerId: 6 });
    fireEvent.pointerCancel(overlay, { pointerId: 5 });
    fireEvent.pointerUp(overlay, { clientX: 50, clientY: 50, pointerId: 5 });
    expect(Object.values(store.getState().doc.nodes).filter((entry) => entry.kind === "sketch")).toHaveLength(0);
  });

  it("uses the chosen colour and width, removes the last stroke, and closes with Done", async () => {
    const { store } = renderEditor(doc());
    await userEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "12" } });
    fireEvent.input(screen.getByLabelText("Colour"), { target: { value: "#aa3300" } });
    const overlay = screen.getByTestId("sketch-overlay");
    const remove = screen.getByRole("button", { name: "Remove last stroke" });
    expect(remove).toBeDisabled();
    stroke(overlay, [
      [10, 10],
      [80, 80],
    ]);
    stroke(overlay, [
      [100, 10],
      [180, 80],
    ]);
    const sketches = () => Object.values(store.getState().doc.nodes).filter((entry) => entry.kind === "sketch");
    expect(sketches()).toHaveLength(2);
    expect(sketches()[0]?.data).toMatchObject({ strokeSize: 12, color: "#aa3300" });

    await userEvent.click(remove);
    expect(sketches()).toHaveLength(1);
    expect(sketches()[0]?.position.x).toBeLessThan(50);

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("sketch-overlay")).not.toBeInTheDocument();
    expect(store.getState().drawMode).toBe(false);
  });

  it("renders a stored sketch as one smooth closed path, stretched to its box", () => {
    const sketch = node("s", {
      kind: "sketch",
      position: { x: 0, y: 0 },
      size: { width: 220, height: 20 },
      data: { points: [5, 10, 0.5, 55, 10, 0.5, 105, 10, 0.5], initialSize: { width: 110, height: 20 }, strokeSize: 7 },
    });
    const { container } = renderEditor(stateOf([sketch]));
    const path = container.querySelector(".sketch-node__ink")?.getAttribute("d") ?? "";
    expect(path).toMatch(/^M .* Z$/);
    const xs = [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => Number(match[1]));
    expect(Math.max(...xs)).toBeGreaterThan(200);
  });
});
