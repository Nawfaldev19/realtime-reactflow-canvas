import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lineProps } from "../document/nodeData";
import { renderEditor } from "../test/canvas";
import { node, sampleState, stateOf } from "../test/fixtures";
import { APPLY_DELAY } from "./fields";

const panel = () => within(screen.getByRole("complementary", { name: "Properties" }));

/** Types into a field and lets the 200ms apply delay pass. */
function typeInto(label: string, value: string) {
  const field = panel().getByLabelText(label);
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value } });
  act(() => {
    vi.advanceTimersByTime(APPLY_DELAY);
  });
}

describe("properties panel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("invites a selection when nothing is selected and is hidden for viewers", () => {
    renderEditor(sampleState());
    expect(panel().getByText(/Select a node/)).toBeInTheDocument();
    const viewer = renderEditor(sampleState(), { canEdit: false });
    expect(viewer.container.querySelectorAll(".properties")).toHaveLength(0);
  });

  it("shows absolute positions for nodes inside groups and applies typed values after a pause", () => {
    const { store } = renderEditor(sampleState(), { selected: ["a"] });
    expect(panel().getByRole("heading", { name: "Step 2" })).toBeInTheDocument();
    expect(panel().getByLabelText("X")).toHaveValue(120);

    const field = panel().getByLabelText("X");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "15" } });
    act(() => {
      vi.advanceTimersByTime(APPLY_DELAY - 50);
    });
    expect(store.getState().doc.nodes.a?.position.x).toBe(20);
    fireEvent.change(field, { target: { value: "150" } });
    act(() => {
      vi.advanceTimersByTime(APPLY_DELAY);
    });
    expect(store.getState().doc.nodes.a?.position).toEqual({ x: 50, y: 40 });
    expect(store.getState().pending).toHaveLength(1);
  });

  it("typing 0 into X moves the node to x = 0", () => {
    const { store } = renderEditor(sampleState(), { selected: ["c"] });
    typeInto("X", "0");
    expect(store.getState().doc.nodes.c?.position.x).toBe(0);
  });

  it("shows blank for values that differ, and applies one value to every selected node", () => {
    const state = stateOf([
      node("p", { size: { width: 100, height: 50 } }),
      node("q", { number: 2, position: { x: 300, y: 0 }, size: { width: 140, height: 50 } }),
    ]);
    const { store } = renderEditor(state, { selected: ["p", "q"] });
    expect(panel().getByRole("heading", { name: "2 nodes" })).toBeInTheDocument();
    expect(panel().getByLabelText("W")).toHaveValue(null);
    expect(panel().getByLabelText("H")).toHaveValue(50);
    typeInto("W", "150");
    expect(store.getState().doc.nodes.p?.size.width).toBe(150);
    expect(store.getState().doc.nodes.q?.size.width).toBe(150);
    expect(store.getState().pending).toHaveLength(1);
  });

  it("edits style and text formatting, with reset to the theme default", async () => {
    const { store } = renderEditor(sampleState(), { selected: ["c"] });
    fireEvent.input(panel().getByLabelText("Fill"), { target: { value: "#ffeecc" } });
    act(() => {
      vi.advanceTimersByTime(APPLY_DELAY);
    });
    expect(store.getState().doc.nodes.c?.style.fill).toBe("#ffeecc");
    await userEvent.click(panel().getByRole("button", { name: "Reset fill" }));
    expect(store.getState().doc.nodes.c?.style).not.toHaveProperty("fill");

    await userEvent.click(panel().getByRole("button", { name: "Bold" }));
    expect(panel().getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.selectOptions(panel().getByLabelText("Align"), "Right");
    await userEvent.selectOptions(panel().getByLabelText("Border style"), "Dashed");
    typeInto("Border width", "3");
    typeInto("Font size", "200");
    await userEvent.click(panel().getByRole("checkbox", { name: "Keep aspect ratio" }));
    expect(store.getState().doc.nodes.c?.style).toEqual({
      fontWeight: "bold",
      textAlign: "right",
      borderStyle: "dashed",
      borderWidth: 3,
      fontSize: 96,
      keepAspectRatio: true,
    });
  });

  it("changes a shape's outline", async () => {
    const { store } = renderEditor(stateOf([node("s", { kind: "shape", data: { shape: "hexagon" } })]), {
      selected: ["s"],
    });
    await userEvent.selectOptions(panel().getByLabelText("Outline"), "Cylinder");
    expect(store.getState().doc.nodes.s?.data.shape).toBe("cylinder");
  });

  it("groups and ungroups from the Arrange section, refusing nodes in different groups", async () => {
    const state = sampleState();
    const { store } = renderEditor(state, { selected: ["a", "c"] });
    expect(panel().getByRole("button", { name: "Group" })).toBeDisabled();
    expect(panel().getByText(/different groups/)).toBeInTheDocument();

    act(() => store.getState().setSelection(["c", "g"], []));
    await userEvent.click(panel().getByRole("button", { name: "Group" }));
    const groups = Object.values(store.getState().doc.nodes).filter((entry) => entry.kind === "group");
    expect(groups).toHaveLength(2);
    expect(store.getState().selectedNodeIds).toEqual([]);

    act(() => store.getState().setSelection(["g"], []));
    await userEvent.click(panel().getByRole("button", { name: "Ungroup" }));
    expect(store.getState().doc.nodes.g).toBeUndefined();
    expect([...store.getState().selectedNodeIds].sort()).toEqual(["a", "b"]);
  });

  it("runs the four stacking commands", async () => {
    const state = stateOf([node("A", { z: 1 }), node("B", { number: 2, z: 2 }), node("C", { number: 3, z: 3 })]);
    const { store } = renderEditor(state, { selected: ["A"] });
    const z = () => ["A", "B", "C"].map((id) => store.getState().doc.nodes[id]?.z);
    await userEvent.click(panel().getByRole("button", { name: "Bring forward" }));
    expect(z()).toEqual([2, 1, 3]);
    await userEvent.click(panel().getByRole("button", { name: "Bring to front" }));
    expect(z()).toEqual([4, 1, 3]);
    await userEvent.click(panel().getByRole("button", { name: "Send backward" }));
    expect(z()).toEqual([3, 1, 4]);
    // Back goes below 1, so the orders are renumbered to 1..n.
    await userEvent.click(panel().getByRole("button", { name: "Send to back" }));
    expect(z()).toEqual([1, 2, 3]);
  });
});

describe("line controls", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const line = node("l", {
    kind: "line",
    position: { x: 0, y: 90 },
    size: { width: 200, height: 20 },
    data: { rotation: 90, length: 200 },
  });
  const rotation = (store: ReturnType<typeof renderEditor>["store"]) => {
    const current = store.getState().doc.nodes.l;
    if (!current) throw new Error("missing line");
    return lineProps(current).rotation;
  };

  it("rotates by ±45°, ±5° (±1° with Shift) and snaps, all through the same rotation rule", async () => {
    const { store } = renderEditor(stateOf([line]), { selected: ["l"] });
    await userEvent.click(panel().getByRole("button", { name: "+45°" }));
    expect(rotation(store)).toBe(135);
    await userEvent.click(panel().getByRole("button", { name: "−45°" }));
    expect(rotation(store)).toBe(90);
    await userEvent.click(panel().getByTitle("Rotate 5° right (Shift: 1°)"));
    expect(rotation(store)).toBe(95);
    fireEvent.click(panel().getByTitle("Rotate 5° left (Shift: 1°)"), { shiftKey: true });
    expect(rotation(store)).toBe(94);
    await userEvent.click(panel().getByRole("button", { name: "Snap vertical" }));
    expect(rotation(store)).toBe(180);
    expect(store.getState().doc.nodes.l?.size).toEqual({ width: 20, height: 200 });
    // From exactly vertical both horizontals are 90° away; the first (90°) wins.
    await userEvent.click(panel().getByRole("button", { name: "Snap horizontal" }));
    expect(rotation(store)).toBe(90);
  });

  it("the angle field and slider produce the same box as the handle would", () => {
    const { store } = renderEditor(stateOf([line]), { selected: ["l"] });
    typeInto("Angle", "-30");
    expect(rotation(store)).toBe(330);
    fireEvent.change(panel().getByRole("slider", { name: /Rotation/ }), { target: { value: "0" } });
    act(() => {
      vi.advanceTimersByTime(APPLY_DELAY);
    });
    expect(rotation(store)).toBe(0);
    expect(store.getState().doc.nodes.l?.position).toEqual({ x: 90, y: 0 });
  });

  it("sets thickness, style and colour", async () => {
    const { store } = renderEditor(stateOf([line]), { selected: ["l"] });
    fireEvent.change(panel().getByRole("slider", { name: /Thickness/ }), { target: { value: "9" } });
    act(() => {
      vi.advanceTimersByTime(APPLY_DELAY);
    });
    await userEvent.selectOptions(panel().getByLabelText("Line style"), "Dotted");
    fireEvent.input(panel().getByLabelText("Line colour"), { target: { value: "#336699" } });
    act(() => {
      vi.advanceTimersByTime(APPLY_DELAY);
    });
    expect(store.getState().doc.nodes.l?.data).toMatchObject({ thickness: 9, lineStyle: "dotted", color: "#336699" });
    await userEvent.click(panel().getByRole("button", { name: "Reset line colour" }));
    expect(store.getState().doc.nodes.l?.data).not.toHaveProperty("color");
  });

  it("resizing a line through the panel keeps it spanning the box", () => {
    const { store } = renderEditor(stateOf([line]), { selected: ["l"] });
    typeInto("W", "300");
    expect(store.getState().doc.nodes.l?.data.length).toBe(300);
  });

  it("edits a sketch's ink", () => {
    const sketch = node("k", {
      kind: "sketch",
      data: { points: [0, 0, 0.5, 10, 10, 0.5], initialSize: { width: 100, height: 50 } },
    });
    const { store } = renderEditor(stateOf([sketch]), { selected: ["k"] });
    fireEvent.change(panel().getByRole("slider", { name: /Stroke width/ }), { target: { value: "11" } });
    act(() => {
      vi.advanceTimersByTime(APPLY_DELAY);
    });
    expect(store.getState().doc.nodes.k?.data.strokeSize).toBe(11);
  });

  it("sets a group's background opacity", () => {
    const { store } = renderEditor(sampleState(), { selected: ["g"] });
    fireEvent.change(panel().getByRole("slider", { name: /Background opacity/ }), { target: { value: "0.25" } });
    act(() => {
      vi.advanceTimersByTime(APPLY_DELAY);
    });
    expect(store.getState().doc.nodes.g?.style.opacity).toBe(0.25);
  });
});
