import { act, fireEvent, screen, within } from "@testing-library/react";
import { Position } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderConnector } from "../../test/connector";
import { edge } from "../../test/fixtures";
import { DOUBLE_CLICK_MS } from "./EdgeLabel";

const at = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1 });
const anchorOf = (label: HTMLElement) => label.parentElement?.style.transform;

/** Presses and releases without moving. */
function press(element: HTMLElement) {
  fireEvent.pointerDown(element, { ...at(0, 0), button: 0 });
  fireEvent.pointerUp(element, at(0, 0));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("label placement and look", () => {
  it("sits at 38.5% of an editable connector by default, with the default text style", () => {
    renderConnector({ route: { style: "polyline", points: [] }, label: { text: "Yes" } }, { selected: false });
    const label = screen.getByTestId("connector-label");
    expect(label).toHaveTextContent("Yes");
    expect(anchorOf(label)).toBe("translate(0px, 77px)");
    expect(label.style.fontSize).toBe("12px");
    expect(label.style.fontWeight).toBe("700");
    expect(label.style.maxWidth).toBe("250px");
  });

  it("sits on the longest middle segment of an automatic step route, and at its stored fraction otherwise", () => {
    const ends = {
      from: { x: 0, y: 0, position: Position.Right },
      to: { x: 200, y: 100, position: Position.Left },
    } as const;
    renderConnector({ label: { text: "Auto" } }, ends);
    expect(anchorOf(screen.getByTestId("connector-label"))).toBe("translate(100px, 50px)");
  });

  it("uses the stored fraction and the label formatting", () => {
    renderConnector({
      route: { style: "polyline", points: [] },
      label: {
        text: "Half",
        t: 0.5,
        bold: true,
        italic: true,
        underline: true,
        border: true,
        borderWidth: 2,
        color: "#112233",
        background: "#ffeedd",
        align: "left",
      },
    });
    const label = screen.getByTestId("connector-label");
    expect(anchorOf(label)).toBe("translate(0px, 100px)");
    expect(label.style.fontWeight).toBe("900");
    expect(label.style.fontStyle).toBe("italic");
    expect(label.style.textDecoration).toBe("underline");
    expect(label.style.borderRadius).toBe("999px");
    expect(label.style.textAlign).toBe("left");
  });

  it("shows a pencil only for a selected connector without a label, and nothing in view mode", () => {
    const { unmount } = renderConnector({ route: { style: "polyline", points: [] } });
    expect(screen.getByRole("button", { name: "Add a label" })).toBeInTheDocument();
    unmount();
    renderConnector({ route: { style: "polyline", points: [] } }, { canEdit: false });
    expect(screen.queryByRole("button", { name: "Add a label" })).toBeNull();
  });

  it("hides the label while a route handle is dragged", async () => {
    renderConnector({
      route: { style: "polyline", points: [{ id: "p", x: 50, y: 100, userCreated: true }] },
      label: { text: "Yes" },
    });
    const point = screen.getByTestId("route-point");
    fireEvent.pointerDown(point, { ...at(50, 100), button: 0 });
    fireEvent.pointerMove(point, at(60, 100));
    await act(async () => new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined))));
    expect(screen.queryByTestId("connector-label")).toBeNull();
    fireEvent.pointerUp(point, at(60, 100));
    expect(screen.getByTestId("connector-label")).toBeInTheDocument();
  });
});

describe("label editing", () => {
  it("opens the quick editor 200 ms after a click, and a double-click edits in place instead", () => {
    vi.useFakeTimers();
    renderConnector({ route: { style: "polyline", points: [] }, label: { text: "Yes" } });
    press(screen.getByTestId("connector-label"));
    act(() => {
      vi.advanceTimersByTime(DOUBLE_CLICK_MS - 1);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("dialog", { name: "Edit connector label" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    press(screen.getByTestId("connector-label"));
    press(screen.getByTestId("connector-label"));
    act(() => {
      vi.advanceTimersByTime(DOUBLE_CLICK_MS * 2);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Label text" })).toHaveValue("Yes");
  });

  it("saves in place on Enter and cancels on Escape", () => {
    vi.useFakeTimers();
    const { store } = renderConnector({ route: { style: "polyline", points: [] }, label: { text: "Yes", t: 0.25 } });
    act(() => {
      store.getState().startLabelEdit("e", "inline");
    });
    const field = screen.getByRole("textbox", { name: "Label text" });
    fireEvent.change(field, { target: { value: "Ready" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(store.getState().doc.edges.e?.label).toEqual({ text: "Yes", t: 0.25 });
    act(() => {
      store.getState().startLabelEdit("e", "inline");
    });
    const again = screen.getByRole("textbox", { name: "Label text" });
    fireEvent.change(again, { target: { value: "Ready" } });
    fireEvent.keyDown(again, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(again, { key: "Enter" });
    expect(store.getState().doc.edges.e?.label).toEqual({ text: "Ready", t: 0.25 });
    expect(store.getState().labelEditing).toBeNull();
  });

  it("offers presets, labels used elsewhere, special characters and delete in the quick editor", () => {
    const { store } = renderConnector({ route: { style: "polyline", points: [] }, label: null });
    act(() => {
      store.getState().apply({ type: "edge.add", edge: edge("other", "b", "a", { label: { text: "Glue first" } }) });
    });
    fireEvent.click(screen.getByRole("button", { name: "Add a label" }));
    const dialog = screen.getByRole("dialog", { name: "Edit connector label" });
    expect(within(dialog).getByRole("button", { name: "Glue first" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "No" }));
    expect(store.getState().doc.edges.e?.label).toEqual({ text: "No" });

    act(() => {
      store.getState().startLabelEdit("e", "quick");
    });
    const field = within(screen.getByRole("dialog")).getByRole("textbox", { name: "Label text" });
    fireEvent.change(field, { target: { value: "Go " } });
    (field as HTMLInputElement).setSelectionRange(3, 3);
    fireEvent.click(screen.getByRole("button", { name: "Rightwards arrow" }));
    expect(field).toHaveValue("Go →");
    expect(screen.getByRole("button", { name: "Rightwards arrow" })).toHaveAttribute("title", "Rightwards arrow");
    fireEvent.submit(field);
    expect(store.getState().doc.edges.e?.label?.text).toBe("Go →");

    act(() => {
      store.getState().startLabelEdit("e", "quick");
    });
    fireEvent.click(screen.getByRole("button", { name: /Delete connector/ }));
    expect(store.getState().doc.edges.e).toBeUndefined();
  });

  it("clears the label when saved empty, and closes when focus leaves the quick editor", () => {
    const { store } = renderConnector({ route: { style: "polyline", points: [] }, label: { text: "Yes" } });
    act(() => {
      store.getState().startLabelEdit("e", "quick");
    });
    const dialog = screen.getByRole("dialog");
    fireEvent.blur(within(dialog).getByRole("textbox"), { relatedTarget: document.body });
    expect(store.getState().labelEditing).toBeNull();
    act(() => {
      store.getState().startLabelEdit("e", "quick");
    });
    const field = within(screen.getByRole("dialog")).getByRole("textbox");
    fireEvent.change(field, { target: { value: "  " } });
    fireEvent.submit(field);
    expect(store.getState().doc.edges.e?.label).toEqual({ text: "" });
  });
});

describe("sliding a label", () => {
  it("projects the pointer onto the path and stores the fraction once, on release", () => {
    const { store } = renderConnector({ route: { style: "polyline", points: [] }, label: { text: "Yes" } });
    const label = screen.getByTestId("connector-label");
    const before = store.getState().pending.length;
    fireEvent.pointerDown(label, { ...at(0, 77), button: 0 });
    fireEvent.pointerMove(label, at(1, 78));
    fireEvent.pointerMove(label, at(30, 150));
    const [, y] = /translate\(0px, ([\d.]+)px\)/.exec(anchorOf(screen.getByTestId("connector-label")) ?? "") ?? [];
    expect(Math.abs(Number(y) - 150)).toBeLessThan(0.5);
    expect(store.getState().pending).toHaveLength(before);
    fireEvent.pointerUp(label, at(40, 150));
    expect(store.getState().pending).toHaveLength(before + 1);
    const t = store.getState().doc.edges.e?.label?.t ?? 0;
    expect(Math.abs(t - 0.75)).toBeLessThan(0.01);
  });
});
