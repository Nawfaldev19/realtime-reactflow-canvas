import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { serializeDocument } from "../document/serialize";
import { DiagramCanvas } from "../editor/Canvas";
import { EditorStoreProvider } from "../editor/EditorStoreContext";
import { createEditorStore } from "../editor/store";
import { node, stateOf } from "../test/fixtures";
import type { NavigationMode } from "../viewport/navigation";
import { ViewMenu } from "./ViewMenu";

// Viewing in the editor canvas: the opening views, the View menu, the zoom
// controls, the custom scrollbars and keyboard navigation. The canvas library
// reports a 500 × 500 canvas in jsdom. The diagram is two 100 × 50 steps,
// one at the origin and one 1000 units below: bounds (0, 0, 100, 1050).

const DOC = stateOf([node("a", { position: { x: 0, y: 0 } }), node("b", { number: 2, position: { x: 0, y: 1000 } })]);

function reduceMotion() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  onTestFinished(() => {
    Reflect.deleteProperty(window, "matchMedia");
  });
}

function renderView({
  viewSettings = {},
  mode = "pan",
  onMode = vi.fn(),
}: { viewSettings?: unknown; mode?: NavigationMode; onMode?: (mode: NavigationMode) => void } = {}) {
  reduceMotion();
  const store = createEditorStore();
  store
    .getState()
    .load({ id: "d1", title: "Plan", revision: 1, document: serializeDocument(DOC), canEdit: true, viewSettings });
  const view = render(
    <EditorStoreProvider store={store}>
      <ReactFlowProvider>
        <ViewMenu />
        <DiagramCanvas navigationMode={mode} onNavigationMode={onMode} />
      </ReactFlowProvider>
    </EditorStoreProvider>,
  );
  return { store, onMode, ...view };
}

function viewport() {
  const style = document.querySelector(".react-flow__viewport")?.getAttribute("style") ?? "";
  const match = /translate\((-?[\d.e-]+)px, ?(-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(style);
  if (!match) throw new Error(`Unexpected viewport style: ${style}`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

function expectViewport(expected: { x: number; y: number; zoom: number }) {
  const actual = viewport();
  expect(actual.x).toBeCloseTo(expected.x, 1);
  expect(actual.y).toBeCloseTo(expected.y, 1);
  expect(actual.zoom).toBeCloseTo(expected.zoom, 4);
}

const opening = (openingView: object) => ({ openingView: { customPercent: 70, savedViewport: null, ...openingView } });
const canvasRegion = () => screen.getByRole("region", { name: /Diagram editor/ });

describe("opening views", () => {
  it("opens fit to width, anchored at the top, by default and shows the canvas only then", () => {
    renderView();
    // zoom = min(1, 500 / 110) = 1; x = 250 − 50; y = 60.
    expectViewport({ x: 200, y: 60, zoom: 1 });
    expect(document.querySelector(".editor-canvas")).not.toHaveClass("canvas--opening");
  });

  it("opens the whole diagram with fit all", () => {
    renderView({ viewSettings: opening({ mode: "fitAll" }) });
    // zoom = min(400 / 100, 400 / 1050); centred on (50, 525).
    const zoom = 400 / 1050;
    expectViewport({ x: 250 - 50 * zoom, y: 250 - 525 * zoom, zoom });
  });

  it("opens at a custom zoom, centred and anchored at the top", () => {
    renderView({ viewSettings: opening({ mode: "custom", customPercent: 70 }) });
    expectViewport({ x: 250 - 50 * 0.7, y: 60, zoom: 0.7 });
  });

  it("opens a saved view exactly", () => {
    renderView({ viewSettings: opening({ mode: "saved", savedViewport: { x: 12, y: -30, zoom: 0.75 } }) });
    expectViewport({ x: 12, y: -30, zoom: 0.75 });
  });

  it("is never re-applied by later edits or by loading the document again", () => {
    const { store } = renderView({ viewSettings: opening({ mode: "custom", customPercent: 70 }) });
    act(() => {
      store.getState().addNode("step", { x: 3000, y: 3000 });
      store.getState().load({
        id: "d1",
        title: "Plan",
        revision: 2,
        document: serializeDocument(DOC),
        canEdit: true,
        viewSettings: opening({ mode: "fitAll" }),
      });
    });
    expectViewport({ x: 215, y: 60, zoom: 0.7 });
  });
});

describe("the View menu", () => {
  const openMenu = async () => {
    await userEvent.click(screen.getByRole("button", { name: "View" }));
    return screen.getByRole("dialog", { name: "View settings" });
  };

  it("applies a chosen opening view to the canvas at once and stores it", async () => {
    const { store } = renderView();
    const menu = await openMenu();
    await userEvent.click(within(menu).getByLabelText(/Fit whole diagram/));
    expect(store.getState().viewSettings.openingView.mode).toBe("fitAll");
    expect(viewport().zoom).toBeCloseTo(400 / 1050, 4);
    await userEvent.click(within(menu).getByLabelText(/Fit width/));
    expectViewport({ x: 200, y: 60, zoom: 1 });
    expect(store.getState().viewSettingsSeq).toBe(2);
  });

  it("previews a custom zoom while typing and clamps it on blur", async () => {
    const { store } = renderView();
    const menu = await openMenu();
    await userEvent.click(within(menu).getByLabelText(/Custom zoom/));
    const field = within(menu).getByLabelText("Zoom (%)");
    await userEvent.clear(field);
    await userEvent.type(field, "150");
    expect(viewport().zoom).toBeCloseTo(1.5, 4);
    expect(store.getState().viewSettings.openingView).toMatchObject({ mode: "custom", customPercent: 150 });
    await userEvent.clear(field);
    await userEvent.type(field, "500");
    await userEvent.tab();
    expect(field).toHaveValue(200);
    expect(viewport().zoom).toBeCloseTo(2, 4);
    expect(store.getState().viewSettings.openingView.customPercent).toBe(200);
  });

  it("saves the current view, confirms it, and opens with it", async () => {
    const { store } = renderView();
    act(() => {
      fireEvent.keyDown(canvasRegion(), { key: "ArrowLeft" });
    });
    const menu = await openMenu();
    await userEvent.click(within(menu).getByLabelText(/Saved view/));
    expect(store.getState().viewSettings.openingView).toMatchObject({
      mode: "saved",
      savedViewport: { x: 240, y: 60, zoom: 1 },
    });
    expect(within(menu).getByRole("status")).toHaveTextContent("Saved the current view (100%)");
    act(() => {
      fireEvent.keyDown(canvasRegion(), { key: "ArrowUp" });
    });
    await userEvent.click(within(menu).getByRole("button", { name: "Save current view" }));
    expect(store.getState().viewSettings.openingView.savedViewport).toEqual({ x: 240, y: 100, zoom: 1 });
  });

  it("switches the build-up animation and shows the save status", async () => {
    const { store } = renderView();
    const menu = await openMenu();
    await userEvent.click(within(menu).getByLabelText(/Animate on open/));
    expect(store.getState().viewSettings.animateOnOpen).toBe(true);
    act(() => store.getState().setViewSettingsStatus("failed"));
    expect(within(menu).getByText(/Could not save the view settings/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "View settings" })).not.toBeInTheDocument();
  });

  it("is not offered to viewers", () => {
    reduceMotion();
    const store = createEditorStore();
    store.getState().load({ id: "d1", title: "Plan", revision: 1, document: serializeDocument(DOC), canEdit: false });
    render(
      <EditorStoreProvider store={store}>
        <ReactFlowProvider>
          <ViewMenu />
        </ReactFlowProvider>
      </EditorStoreProvider>,
    );
    expect(screen.queryByRole("button", { name: "View" })).not.toBeInTheDocument();
  });
});

describe("zoom controls", () => {
  it("zooms in and out about the canvas centre, with a rounded label", async () => {
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    // About (250, 250): x' = 250 − (250 − 200) × 1.2 = 190.
    expectViewport({ x: 190, y: 250 - 190 * 1.2, zoom: 1.2 });
    expect(screen.getByTestId("zoom-label")).toHaveTextContent("120%");
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(viewport().zoom).toBeCloseTo(1, 4);
  });

  it("applies presets exactly and disables zoom in at 200%", async () => {
    renderView();
    await userEvent.click(screen.getByTestId("zoom-label"));
    await userEvent.click(screen.getByRole("menuitem", { name: "200%" }));
    expect(viewport().zoom).toBe(2);
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    await userEvent.click(screen.getByTestId("zoom-label"));
    expect(screen.getByRole("menuitem", { name: "Zoom in" })).toBeDisabled();
    await userEvent.click(screen.getByRole("menuitem", { name: "10%" }));
    expect(viewport().zoom).toBe(0.1);
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });

  it("drives the zoom from the slider", () => {
    renderView();
    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "50" } });
    expect(viewport().zoom).toBe(0.5);
  });

  it("fits, goes to start and back to the opening view", async () => {
    renderView({ viewSettings: opening({ mode: "custom", customPercent: 50 }) });
    await userEvent.click(screen.getByRole("button", { name: "Fit" }));
    // Fit moves the diagram up by half the footer (22 px).
    const zoom = 400 / 1050;
    expectViewport({ x: 250 - 50 * zoom, y: 250 - 525 * zoom - 22, zoom });
    await userEvent.click(screen.getByRole("button", { name: "Go to start" }));
    expectViewport({ x: 200, y: 60, zoom: 1 });
    await userEvent.click(screen.getByTestId("zoom-label"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Opening view" }));
    expectViewport({ x: 225, y: 60, zoom: 0.5 });
  });
});

describe("scrollbars", () => {
  const thumb = (orientation: "horizontal" | "vertical") =>
    screen.getByRole("scrollbar", { name: orientation === "horizontal" ? "Scroll horizontally" : "Scroll vertically" });

  it("are on by default in scroll mode, can be hidden, and are off by default in pan mode", async () => {
    renderView({ mode: "scroll" });
    expect(thumb("vertical")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show scrollbars" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(screen.queryByRole("scrollbar")).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("follow the view and move it with keys, drags and track clicks", () => {
    renderView({ mode: "pan", viewSettings: opening({ mode: "saved", savedViewport: { x: 0, y: 0, zoom: 1 } }) });
    fireEvent.click(screen.getByRole("button", { name: "Show scrollbars" }));
    const vertical = thumb("vertical");
    // Extent y: [−800, 1850]; s = −y = 0 in [−800, 1350]: 37% of the way.
    expect(vertical).toHaveAttribute("aria-valuenow", String(Math.round((800 / 2150) * 100)));
    fireEvent.keyDown(vertical, { key: "ArrowDown" });
    expect(viewport().y).toBe(-20);
    fireEvent.keyDown(vertical, { key: "Home" });
    expect(viewport().y).toBe(800);
    fireEvent.keyDown(vertical, { key: "End" });
    expect(viewport().y).toBeCloseTo(-1350, 6);
    fireEvent.keyDown(vertical, { key: "x" });
    expect(viewport().y).toBeCloseTo(-1350, 6);

    // Dragging the thumb back to the top of the track shows the top of the extent.
    fireEvent.pointerDown(vertical, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(vertical, { clientY: -1000, pointerId: 1 });
    fireEvent.pointerUp(vertical, { clientY: -1000, pointerId: 1 });
    expect(viewport().y).toBe(800);
    fireEvent.pointerMove(vertical, { clientY: 0, pointerId: 1 });
    expect(viewport().y).toBe(800);

    // A click on the track below the thumb pages down by one canvas height.
    fireEvent.pointerDown(screen.getByTestId("scrollbar-vertical"), { clientY: 350 });
    expect(viewport().y).toBe(800 - 500);
    // The horizontal bar works the same way.
    fireEvent.keyDown(thumb("horizontal"), { key: "ArrowRight" });
    expect(viewport().x).toBe(-20);
  });
});

describe("keyboard navigation", () => {
  it("pans with the arrows, zooms with + and −, and returns to the opening view with 0", () => {
    renderView();
    const region = canvasRegion();
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expectViewport({ x: 240, y: 60, zoom: 1 });
    fireEvent.keyDown(region, { key: "ArrowDown", shiftKey: true });
    expectViewport({ x: 240, y: -140, zoom: 1 });
    fireEvent.keyDown(region, { key: "+" });
    expect(viewport().zoom).toBeCloseTo(1.2, 4);
    fireEvent.keyDown(region, { key: "-" });
    expect(viewport().zoom).toBeCloseTo(1, 4);
    fireEvent.keyDown(region, { key: "0" });
    expectViewport({ x: 200, y: 60, zoom: 1 });
  });

  it("leaves keys alone in text fields, on nodes, with modifiers, and for other keys", () => {
    renderView();
    const node = document.querySelector('.react-flow__node[data-id="a"]');
    if (!node) throw new Error("no node");
    fireEvent.keyDown(node, { key: "ArrowLeft" });
    fireEvent.keyDown(canvasRegion(), { key: "ArrowLeft", ctrlKey: true });
    fireEvent.keyDown(canvasRegion(), { key: "q" });
    expectViewport({ x: 200, y: 60, zoom: 1 });
  });
});

describe("navigation mode", () => {
  it("offers pan and scroll and reports the choice", async () => {
    const { onMode } = renderView({ mode: "pan" });
    expect(screen.getByRole("button", { name: /Pan mode/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /Scroll mode/ }));
    expect(onMode).toHaveBeenCalledWith("scroll");
  });

  it("shows and hides the minimap", async () => {
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "Show minimap" }));
    expect(document.querySelector(".react-flow__minimap")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show minimap" }));
    expect(document.querySelector(".react-flow__minimap")).not.toBeInTheDocument();
  });
});
