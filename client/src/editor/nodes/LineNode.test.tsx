import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { lineProps } from "../../document/nodeData";
import { renderEditor } from "../../test/canvas";
import { node, stateOf } from "../../test/fixtures";

// The line's box is (100, 100) 160 × 20, so its pivot is (180, 110). In jsdom
// the canvas sits at the origin with zoom 1, so client and canvas
// coordinates coincide. The handle starts 26px below the pivot (180°).
const line = node("line", {
  kind: "line",
  position: { x: 100, y: 100 },
  size: { width: 160, height: 20 },
  data: { rotation: 90, length: 160, thickness: 4 },
});
const pivot = { x: 180, y: 110 };

const at = (degrees: number, radius = 26) => {
  const radians = (degrees * Math.PI) / 180;
  return { clientX: pivot.x + radius * Math.sin(radians), clientY: pivot.y - radius * Math.cos(radians), pointerId: 7 };
};

describe("LineNode", () => {
  it("shows a rotate handle only while selected", () => {
    renderEditor(stateOf([line]));
    expect(screen.queryByRole("slider", { name: "Rotate line" })).not.toBeInTheDocument();
  });

  it("rotating near a cardinal angle previews the snap and snaps exactly on release, in one operation", () => {
    const { store } = renderEditor(stateOf([line]), { selected: ["line"] });
    const handle = screen.getByRole("slider", { name: "Rotate line" });

    fireEvent.pointerDown(handle, { ...at(180), button: 0 });
    fireEvent.pointerMove(handle, at(220));
    expect(screen.queryByTestId("line-snap-guide")).not.toBeInTheDocument();
    expect(store.getState().live.line?.data).toEqual({ rotation: 130 });
    fireEvent.pointerMove(handle, at(266));
    expect(screen.getByTestId("line-snap-guide")).toBeInTheDocument();
    // Live: the raw angle 176°, with the visible length unchanged.
    expect(store.getState().live.line?.data).toEqual({ rotation: 176 });
    expect(store.getState().pending).toHaveLength(0);

    fireEvent.pointerUp(handle, at(266));
    const committed = store.getState().doc.nodes.line;
    if (!committed) throw new Error("missing line");
    expect(lineProps(committed)).toMatchObject({ rotation: 180, length: 160 });
    expect(committed.size).toEqual({ width: 20, height: 160 });
    expect(committed.position).toEqual({ x: 170, y: 30 });
    expect(store.getState().live).toEqual({});
    expect(store.getState().pending).toHaveLength(1);
    expect(screen.queryByTestId("line-snap-guide")).not.toBeInTheDocument();
  });

  it("keeps an angle outside the snap windows, and unwraps across the 0°/360° seam", () => {
    const { store } = renderEditor(stateOf([line]), { selected: ["line"] });
    const handle = screen.getByRole("slider", { name: "Rotate line" });
    fireEvent.pointerDown(handle, { ...at(180), button: 0 });
    // Pointer swings from 180° to 172°: −8°, so the line goes from 90° to 82°.
    fireEvent.pointerMove(handle, at(172));
    fireEvent.pointerUp(handle, at(172));
    expect(store.getState().doc.nodes.line?.data.rotation).toBeCloseTo(82, 6);

    const rotated = screen.getByRole("slider", { name: "Rotate line" });
    // From the current handle direction, a turn across 0°: the delta unwraps to a small negative turn.
    fireEvent.pointerDown(rotated, { ...at(10), button: 0 });
    fireEvent.pointerMove(rotated, at(350));
    fireEvent.pointerUp(rotated, at(350));
    expect(store.getState().doc.nodes.line?.data.rotation).toBeCloseTo(62, 6);
  });

  it("deselecting during a drag cancels it and clears the guide", () => {
    const { store } = renderEditor(stateOf([line]), { selected: ["line"] });
    const handle = screen.getByRole("slider", { name: "Rotate line" });
    fireEvent.pointerDown(handle, { ...at(180), button: 0 });
    fireEvent.pointerMove(handle, at(266));
    act(() => store.getState().setSelection([], []));
    expect(store.getState().live).toEqual({});
    expect(screen.queryByTestId("line-snap-guide")).not.toBeInTheDocument();
    expect(store.getState().doc.nodes.line?.data.rotation).toBe(90);
  });

  it("ignores other buttons and stray pointers, and a cancelled pointer leaves the line as it was", () => {
    const { store } = renderEditor(stateOf([line]), { selected: ["line"] });
    const handle = screen.getByRole("slider", { name: "Rotate line" });
    fireEvent.pointerDown(handle, { ...at(180), button: 2 });
    fireEvent.pointerMove(handle, at(266));
    expect(store.getState().live).toEqual({});

    fireEvent.pointerDown(handle, { ...at(180), button: 0 });
    fireEvent.pointerMove(handle, { ...at(266), pointerId: 99 });
    fireEvent.pointerUp(handle, { ...at(266), pointerId: 99 });
    expect(store.getState().live).toEqual({});
    fireEvent.pointerMove(handle, at(230));
    fireEvent.pointerCancel(handle, at(230));
    expect(store.getState().live).toEqual({});
    expect(store.getState().doc.nodes.line?.data.rotation).toBe(90);
  });
});
