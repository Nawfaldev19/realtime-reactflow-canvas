import { act, fireEvent, screen } from "@testing-library/react";
import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { renderConnector } from "../../test/connector";

const at = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1 });
const frame = () => act(async () => new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined))));

describe("ConnectorEdge drawing", () => {
  it("draws a polyline with its end arrow, a trimmed hit stroke and no handles when not selected", () => {
    const { container } = renderConnector({ route: { style: "polyline", points: [] } }, { selected: false });
    expect(container.querySelector(".connector__line")?.getAttribute("d")).toBe("M 0 0 L 0 200");
    expect(container.querySelector(".connector__line")?.getAttribute("marker-end")).toBe("url(#connector-e-end)");
    expect(container.querySelector(".connector__line")?.getAttribute("marker-start")).toBeNull();
    expect(container.querySelector("marker#connector-e-end")).not.toBeNull();
    expect(container.querySelector(".connector__hit")?.getAttribute("d")?.startsWith("M 0 12")).toBe(true);
    expect(screen.queryAllByTestId("route-add-handle")).toHaveLength(0);
    expect(screen.getAllByTestId(/^grab-/)).toHaveLength(2);
  });

  it("draws an orthogonal route with rounded corners between offset ports", () => {
    const { container } = renderConnector(
      {},
      { from: { x: 0, y: 0, position: Position.Right }, to: { x: 200, y: 100, position: Position.Left } },
    );
    expect(container.querySelector(".connector__line")?.getAttribute("d")).toBe(
      "M 0 0 L 20 0 L 95 0 Q 100 0 100 5 L 100 95 Q 100 100 105 100 L 180 100 L 200 100",
    );
    expect(screen.getAllByTestId("segment-handle")).toHaveLength(3);
  });

  it("styles dashed, animated connectors with a seamless loop and both arrows", () => {
    const { container } = renderConnector(
      { style: { pattern: "dashed", width: 3, animated: true, startMarker: "open", stroke: "#336699" } },
      { selected: false },
    );
    const line = container.querySelector<SVGPathElement>(".connector__line");
    expect(line?.style.strokeDasharray).toBe("15 15");
    expect(line?.classList.contains("connector__line--ants")).toBe(true);
    expect(line?.style.getPropertyValue("--ants-period")).toBe("30");
    expect(line?.style.animationDuration).toBe("1.5s");
    expect(line?.getAttribute("marker-start")).toBe("url(#connector-e-start)");
    expect(container.querySelector("marker#connector-e-start")?.getAttribute("orient")).toBe("auto-start-reverse");
    expect(container.querySelector<SVGGElement>("[data-testid=connector]")?.style.color).toBe("rgb(51, 102, 153)");
  });

  it("draws floating connectors straight and without route handles", () => {
    const { container } = renderConnector({ kind: "floating" });
    expect(container.querySelector(".connector__line")?.getAttribute("d")).toBe("M 0 0 L 0 200");
    expect(screen.queryAllByTestId("segment-handle")).toHaveLength(0);
  });

  it("shows no handles in view mode or on ghost connectors", () => {
    renderConnector({}, { canEdit: false });
    expect(screen.queryAllByTestId("segment-handle")).toHaveLength(0);
    expect(screen.queryAllByTestId(/^grab-/)).toHaveLength(0);
  });

  it("shows route handles when an attached step is selected", () => {
    renderConnector({ route: { style: "polyline", points: [] } }, { selected: false, endpointSelected: true });
    expect(screen.getAllByTestId("route-add-handle")).toHaveLength(1);
  });
});

describe("point editing", () => {
  it("turns a pressed add handle into exactly one point, dragged at once and committed once", async () => {
    const { store } = renderConnector({ route: { style: "polyline", points: [] } });
    const before = store.getState().pending.length;
    const add = screen.getByTestId("route-add-handle");
    fireEvent.pointerDown(add, { ...at(0, 100), button: 0 });
    for (let step = 1; step <= 40; step += 1) fireEvent.pointerMove(add, at(step, 100));
    await frame();
    // The draft is drawn before anything is committed.
    expect(store.getState().pending).toHaveLength(before);
    expect(screen.getAllByTestId("route-point")).toHaveLength(1);
    fireEvent.pointerUp(add, at(40, 100));
    expect(store.getState().pending).toHaveLength(before + 1);
    expect(store.getState().doc.edges.e?.route.points).toEqual([
      expect.objectContaining({ x: 40, y: 100, userCreated: true }),
    ]);
    expect(screen.getAllByTestId("route-add-handle")).toHaveLength(2);
  });

  it("snaps to the source's x within 7 screen pixels, measured at the current zoom", () => {
    const { store } = renderConnector(
      { route: { style: "polyline", points: [{ id: "p", x: 60, y: 100, userCreated: true }] } },
      { zoom: 0.5 },
    );
    const point = screen.getByTestId("route-point");
    // At zoom 0.5 a client x of 6 is canvas x 12: 12 units = 6 screen px from the source's x = 0, so it snaps.
    fireEvent.pointerDown(point, { ...at(30, 50), button: 0 });
    fireEvent.pointerMove(point, at(6, 60));
    fireEvent.pointerUp(point, at(6, 60));
    expect(store.getState().doc.edges.e?.route.points[0]).toMatchObject({ x: 0, y: 120 });
    // Canvas x = 16 is 8 screen px away: no snap.
    fireEvent.pointerDown(point, { ...at(0, 60), button: 0 });
    fireEvent.pointerMove(point, at(8, 60));
    fireEvent.pointerUp(point, at(8, 60));
    expect(store.getState().doc.edges.e?.route.points[0]).toMatchObject({ x: 16, y: 120 });
  });

  it("shows a guide while a snap is active", async () => {
    renderConnector({ route: { style: "polyline", points: [{ id: "p", x: 60, y: 100, userCreated: true }] } });
    const point = screen.getByTestId("route-point");
    fireEvent.pointerDown(point, { ...at(60, 100), button: 0 });
    fireEvent.pointerMove(point, at(3, 100));
    await frame();
    expect(screen.getByTestId("snap-guide")).toBeInTheDocument();
    fireEvent.pointerUp(point, at(3, 100));
    expect(screen.queryByTestId("snap-guide")).toBeNull();
  });

  it("ignores a second pointer during a drag", () => {
    const { store } = renderConnector({
      route: { style: "polyline", points: [{ id: "p", x: 60, y: 100, userCreated: true }] },
    });
    const point = screen.getByTestId("route-point");
    fireEvent.pointerDown(point, { ...at(60, 100), button: 0 });
    fireEvent.pointerDown(point, { clientX: 90, clientY: 90, pointerId: 2, button: 0 });
    fireEvent.pointerMove(point, { clientX: 90, clientY: 90, pointerId: 2 });
    fireEvent.pointerUp(point, { clientX: 90, clientY: 90, pointerId: 2 });
    fireEvent.pointerMove(point, at(70, 110));
    fireEvent.lostPointerCapture(point, at(70, 110));
    expect(store.getState().doc.edges.e?.route.points[0]).toMatchObject({ x: 70, y: 110 });
  });

  it("nudges with the arrow keys and removes with Backspace, keeping the connector", () => {
    const { store } = renderConnector({
      route: { style: "spline", points: [{ id: "p", x: 60, y: 100, userCreated: true }] },
    });
    const point = screen.getByTestId("route-point");
    fireEvent.keyDown(point, { key: "ArrowRight" });
    expect(store.getState().doc.edges.e?.route.points[0]).toMatchObject({ x: 65, y: 100 });
    fireEvent.keyDown(screen.getByTestId("route-point"), { key: "ArrowUp", altKey: true });
    expect(store.getState().doc.edges.e?.route.points[0]).toMatchObject({ x: 65, y: 99 });
    fireEvent.keyDown(screen.getByTestId("route-point"), { key: "Backspace" });
    expect(store.getState().doc.edges.e?.route.points).toEqual([]);
    expect(store.getState().doc.edges.e).toBeDefined();
  });

  it("moves focus to the previous point after a removal, or to the connector when none is left", async () => {
    const { container } = renderConnector({
      route: {
        style: "polyline",
        points: [
          { id: "p1", x: 40, y: 50, userCreated: true },
          { id: "p2", x: 60, y: 150, userCreated: true },
        ],
      },
    });
    const handles = screen.getAllByTestId("route-point");
    expect(handles.every((handle) => handle.getAttribute("tabindex") === "0")).toBe(true);
    fireEvent.keyDown(handles[1] as Element, { key: "Delete" });
    await frame();
    expect(document.activeElement?.getAttribute("data-handle-id")).toBe("p1");
    fireEvent.keyDown(screen.getByTestId("route-point"), { key: "Backspace" });
    await frame();
    expect(document.activeElement).toBe(container.querySelector(".react-flow__edge"));
  });

  it("adds a point with Enter on an add handle and removes one with a right-click", () => {
    const { store } = renderConnector({ route: { style: "bezier", points: [] } });
    fireEvent.keyDown(screen.getByTestId("route-add-handle"), { key: "Enter" });
    expect(store.getState().doc.edges.e?.route.points).toHaveLength(1);
    const menu = fireEvent.contextMenu(screen.getByTestId("route-point"));
    expect(menu).toBe(false);
    expect(store.getState().doc.edges.e?.route.points).toHaveLength(0);
    fireEvent.contextMenu(screen.getByTestId("route-add-handle"));
    fireEvent.keyDown(screen.getByTestId("route-add-handle"), { key: "x" });
    expect(store.getState().doc.edges.e?.route.points).toHaveLength(0);
  });
});

describe("segment editing", () => {
  const offset = {
    from: { x: 0, y: 0, position: Position.Right },
    to: { x: 200, y: 100, position: Position.Left },
  } as const;

  it("drags a middle segment along its axis and commits the edited route once", async () => {
    const { store } = renderConnector({}, offset);
    const middle = screen.getAllByTestId("segment-handle").find((handle) => handle.getAttribute("data-axis") === "x");
    if (!middle) throw new Error("no vertical segment");
    const before = store.getState().pending.length;
    fireEvent.pointerDown(middle, { ...at(100, 50), button: 0 });
    fireEvent.pointerMove(middle, at(140, 70));
    await frame();
    fireEvent.pointerUp(middle, at(150, 70));
    expect(store.getState().pending).toHaveLength(before + 1);
    const points = store.getState().doc.edges.e?.route.points ?? [];
    expect(points.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 20, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 100 },
      { x: 180, y: 100 },
    ]);
  });

  it("commits a drag released where the drawn draft already is", async () => {
    const { store } = renderConnector({}, offset);
    const [first] = screen.getAllByTestId("segment-handle");
    if (!first) throw new Error("no handle");
    fireEvent.pointerDown(first, { ...at(35, 0), button: 0 });
    fireEvent.pointerMove(first, at(35, 40));
    await frame();
    fireEvent.pointerUp(first, at(35, 40));
    expect(store.getState().doc.edges.e?.route.points.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 20, y: 0 },
      { x: 20, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 100 },
      { x: 180, y: 100 },
    ]);
  });

  it("does nothing on a click without movement", () => {
    const { store } = renderConnector({}, offset);
    const [first] = screen.getAllByTestId("segment-handle");
    if (!first) throw new Error("no handle");
    fireEvent.pointerDown(first, { ...at(35, 0), button: 0 });
    fireEvent.pointerUp(first, at(35, 0));
    expect(store.getState().doc.edges.e?.route.points).toEqual([]);
  });

  it("moves a segment with the arrow keys along its axis only, and Delete returns to automatic routing", () => {
    const { store } = renderConnector({}, offset);
    const vertical = () =>
      screen.getAllByTestId("segment-handle").find((handle) => handle.getAttribute("data-axis") === "x");
    const handle = vertical();
    if (!handle) throw new Error("no vertical segment");
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(store.getState().doc.edges.e?.route.points).toEqual([]);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(store.getState().doc.edges.e?.route.points[1]).toMatchObject({ x: 105 });
    const moved = vertical();
    if (!moved) throw new Error("no vertical segment");
    fireEvent.keyDown(moved, { key: "Delete" });
    expect(store.getState().doc.edges.e?.route.points).toEqual([]);
  });

  it("removes an edit with a right-click", () => {
    const { store } = renderConnector({}, offset);
    const handle = screen.getAllByTestId("segment-handle").find((entry) => entry.getAttribute("data-axis") === "x");
    if (!handle) throw new Error("no vertical segment");
    fireEvent.keyDown(handle, { key: "ArrowLeft", altKey: true });
    expect(store.getState().doc.edges.e?.route.points[1]).toMatchObject({ x: 99 });
    const edited = screen.getAllByTestId("segment-handle").find((entry) => entry.getAttribute("data-axis") === "x");
    if (!edited) throw new Error("no vertical segment");
    fireEvent.contextMenu(edited);
    expect(store.getState().doc.edges.e?.route.points).toEqual([]);
  });
});

describe("reconnecting", () => {
  it("snaps back when an end is dropped on empty canvas", async () => {
    const { store, container } = renderConnector({});
    const grab = screen.getByTestId("grab-target");
    fireEvent.pointerDown(grab, { ...at(0, 190), button: 0 });
    fireEvent.pointerMove(grab, at(300, 300));
    await frame();
    expect(container.querySelector(".connector__line")?.getAttribute("d")).toContain("300");
    fireEvent.pointerUp(grab, at(300, 300));
    expect(store.getState().doc.edges.e).toMatchObject({ source: "a", target: "b" });
    expect(container.querySelector(".connector__line")?.getAttribute("d")).not.toContain("300");
  });

  it("ignores presses that are not on an end", () => {
    renderConnector({});
    const grab = screen.getByTestId("grab-source");
    grab.removeAttribute("data-end");
    fireEvent.pointerDown(grab, { ...at(0, 10), button: 0 });
    fireEvent.pointerUp(grab, at(0, 10));
    fireEvent.pointerDown(grab, { ...at(0, 10), button: 2 });
  });
});

describe("attaching to live steps", () => {
  const boxes = {
    a: { x: 0, y: 0, width: 100, height: 60 },
    b: { x: 300, y: 100, width: 100, height: 60 },
    c: { x: 600, y: 0, width: 100, height: 60 },
  };

  it("attaches to the closest sides of the measured steps and routes around them", () => {
    const { container } = renderConnector({}, { boxes });
    expect(container.querySelector(".connector__line")?.getAttribute("d")).toMatch(/^M 100 30 L 120 30 .* L 300 130$/);
  });

  it("falls back to the library's handle positions until both steps are measured", () => {
    const { container } = renderConnector({ route: { style: "polyline", points: [] } }, { boxes: { a: boxes.a } });
    expect(container.querySelector(".connector__line")?.getAttribute("d")).toBe("M 0 0 L 0 200");
  });

  it("reconnects the dragged end to the step whose drop zone it is released in", async () => {
    const { store } = renderConnector({ label: { text: "Yes" } }, { boxes });
    const grab = screen.getByTestId("grab-target");
    fireEvent.pointerDown(grab, { ...at(290, 130), button: 0 });
    fireEvent.pointerMove(grab, at(400, 100));
    await frame();
    fireEvent.pointerUp(grab, at(650, 30));
    expect(store.getState().doc.edges.e).toMatchObject({
      id: "e",
      source: "a",
      target: "c",
      targetSide: null,
      label: { text: "Yes" },
    });
  });

  it("moves the source end to the pointer while it is dragged", async () => {
    const { container } = renderConnector({ route: { style: "polyline", points: [] } }, { boxes });
    const grab = screen.getByTestId("grab-source");
    fireEvent.pointerDown(grab, { ...at(110, 30), button: 0 });
    fireEvent.pointerMove(grab, at(150, 400));
    await frame();
    expect(container.querySelector(".connector__line")?.getAttribute("d")).toBe("M 150 400 L 300 130");
    fireEvent.pointerCancel(grab, at(150, 400));
    expect(container.querySelector(".connector__line")?.getAttribute("d")).toBe("M 100 30 L 300 130");
  });
});
