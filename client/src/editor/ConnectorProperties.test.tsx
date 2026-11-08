import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderEditor } from "../test/canvas";
import { edge, node, stateOf } from "../test/fixtures";
import { APPLY_DELAY } from "./fields";

const panel = () => within(screen.getByRole("complementary", { name: "Properties" }));

function threeConnectors() {
  const doc = stateOf(
    [node("a"), node("b", { number: 2 }), node("c", { number: 3 }), node("d", { number: 4 })],
    [
      edge("e1", "a", "b"),
      edge("e2", "b", "c", { route: { style: "polyline", points: [{ id: "p", x: 1, y: 1 }] } }),
      edge("e3", "c", "d"),
    ],
  );
  const view = renderEditor(doc);
  act(() => {
    view.store.getState().setSelection([], ["e1", "e2", "e3"]);
  });
  return view;
}

describe("connector properties", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("titles the selection and applies a change to every selected connector as one operation", () => {
    const { store } = threeConnectors();
    expect(panel().getByRole("heading", { name: "3 connectors" })).toBeInTheDocument();
    const before = store.getState().pending.length;
    fireEvent.change(panel().getByLabelText("Pattern"), { target: { value: "dotted" } });
    expect(store.getState().pending).toHaveLength(before + 1);
    expect(Object.values(store.getState().doc.edges).map((entry) => entry.style.pattern)).toEqual([
      "dotted",
      "dotted",
      "dotted",
    ]);
  });

  it("shows the first connector's values and switches route styles with an undo notice", () => {
    const { store } = threeConnectors();
    const styles = panel().getByRole("group", { name: "Route style" });
    expect(within(styles).getByRole("button", { name: "Orthogonal step" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(styles).getByRole("button", { name: "Bézier spline" }));
    expect(
      Object.values(store.getState().doc.edges).every(
        (entry) => entry.route.style === "bezier" && entry.route.points.length === 0,
      ),
    ).toBe(true);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Route points cleared.");
    fireEvent.click(within(notice).getByRole("button", { name: "Undo" }));
    expect(store.getState().doc.edges.e2?.route.points).toHaveLength(1);
    expect(screen.queryByText(/Route points cleared/)).toBeNull();
  });

  it("dismisses the notice by itself after a while", () => {
    const { store } = threeConnectors();
    fireEvent.click(
      within(panel().getByRole("group", { name: "Route style" })).getByRole("button", { name: "Spline" }),
    );
    expect(screen.getByText("Route points cleared.")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(store.getState().routeNotice).toBeNull();
    fireEvent.click(
      within(panel().getByRole("group", { name: "Route style" })).getByRole("button", { name: "Polyline" }),
    );
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("changes the connector type, hiding the route styles for floating connectors", () => {
    const { store } = threeConnectors();
    fireEvent.change(panel().getByLabelText("Connector type"), { target: { value: "floating" } });
    expect(store.getState().doc.edges.e1?.kind).toBe("floating");
    expect(panel().queryByRole("group", { name: "Route style" })).toBeNull();
  });

  it("enables the animation only for dotted and dashed lines", () => {
    const { store } = threeConnectors();
    const animate = () => panel().getByRole("checkbox", { name: /Animate/ });
    expect(animate()).toBeDisabled();
    fireEvent.change(panel().getByLabelText("Pattern"), { target: { value: "dashed" } });
    fireEvent.click(animate());
    expect(store.getState().doc.edges.e3?.style).toEqual({ pattern: "dashed", animated: true });
    fireEvent.click(animate());
    expect(store.getState().doc.edges.e3?.style).toEqual({ pattern: "dashed" });
  });

  it("sets markers, widths and colours", () => {
    const { store } = threeConnectors();
    fireEvent.change(panel().getByLabelText("Start arrow"), { target: { value: "open" } });
    fireEvent.change(panel().getByLabelText("End arrow"), { target: { value: "none" } });
    const width = panel().getByLabelText("Width");
    fireEvent.focus(width);
    fireEvent.change(width, { target: { value: "14" } });
    act(() => {
      vi.advanceTimersByTime(APPLY_DELAY);
    });
    fireEvent.change(panel().getByLabelText("Line colour"), { target: { value: "#ff0000" } });
    act(() => {
      vi.advanceTimersByTime(APPLY_DELAY);
    });
    expect(store.getState().doc.edges.e1?.style).toEqual({
      startMarker: "open",
      endMarker: "none",
      width: 10,
      stroke: "#ff0000",
    });
    fireEvent.click(panel().getByRole("button", { name: "Reset line colour" }));
    expect(store.getState().doc.edges.e1?.style.stroke).toBeUndefined();
  });

  it("formats labels, including a pill border", () => {
    const { store } = threeConnectors();
    fireEvent.click(panel().getByRole("button", { name: "Bold" }));
    fireEvent.click(panel().getByRole("button", { name: "Italic" }));
    fireEvent.click(panel().getByRole("button", { name: "Underline" }));
    fireEvent.click(panel().getByRole("button", { name: "Align right" }));
    expect(store.getState().doc.edges.e1?.label).toEqual({
      text: "",
      bold: true,
      italic: true,
      underline: true,
      align: "right",
    });
    expect(panel().queryByLabelText("Border width")).toBeNull();
    fireEvent.click(panel().getByRole("checkbox", { name: "Border (pill)" }));
    expect(store.getState().doc.edges.e2?.label?.border).toBe(true);
    expect(panel().getByLabelText("Border width")).toBeInTheDocument();
    fireEvent.click(panel().getByRole("button", { name: "Reset label background" }));
  });

  it("moves connectors between layers", () => {
    const { store } = threeConnectors();
    fireEvent.click(panel().getByRole("button", { name: "Send to back" }));
    expect(store.getState().doc.edges.e1?.style.layer).toBe("back");
    expect(panel().getByRole("button", { name: "Send to back" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(panel().getByRole("button", { name: "Normal layer" }));
    expect(store.getState().doc.edges.e1?.style.layer).toBeUndefined();
  });

  it("is shown together with node properties for a mixed selection", () => {
    const { store } = threeConnectors();
    act(() => {
      store.getState().setSelection(["a"], ["e1"]);
    });
    expect(panel().getByRole("heading", { name: "Connector" })).toBeInTheDocument();
    expect(panel().getByRole("heading", { name: "Step 1" })).toBeInTheDocument();
  });
});
