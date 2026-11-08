import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApolloProvider, type Operation } from "@apollo/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { SessionProvider } from "../lib/session";
import { animations, runningAnimations } from "../test/animation";
import { scriptedClient } from "../test/scriptedClient";
import { PreviewPage } from "./PreviewPage";

// The read-only preview and its build-up animation. The diagram is a chain
// n1 → n2 → n3 (the first connector labelled "Go"); the planned sequence is
// n1 at 0 ms, its connector at 100, n2 at 200, its connector at 300, n3 at 400,
// with everything done at 700 ms. jsdom has no layout, so the canvas library
// draws no connectors here; the connector side of the animation is tested on
// the connector itself (src/preview/reveal.test.tsx).

const step = (id: string, y: number, text: string) => ({
  id,
  key: id,
  kind: "step",
  number: Number(id.slice(1)),
  position: { x: 0, y },
  size: { width: 180, height: 64 },
  parentId: null,
  z: 1,
  style: {},
  data: { text },
});
const connector = (id: string, source: string, target: string, label: string | null = null) => ({
  id,
  key: id,
  kind: "connector",
  source,
  target,
  sourceSide: null,
  targetSide: null,
  route: { style: "step", points: [] },
  label: label ? { text: label } : null,
  style: {},
});

const DOCUMENT = {
  schemaVersion: 1,
  nextNumber: 4,
  // Stored out of reading order on purpose: the reveal follows the layout, not the list.
  nodes: [step("n3", 240, "Sand to 220 grit"), step("n1", 0, "Mill the boards"), step("n2", 120, "Cut the joints")],
  edges: [connector("e1", "n1", "n2", "Go"), connector("e2", "n2", "n3")],
};

const SETTINGS = {
  openingView: { mode: "saved", customPercent: 70, savedViewport: { x: 0, y: 0, zoom: 1 } },
  background: { pattern: "dots", gap: 20 },
  animateOnOpen: true,
};

function reply(document: unknown = DOCUMENT, viewSettings: unknown = SETTINGS) {
  return {
    data: {
      diagram: {
        __typename: "Diagram",
        id: "9",
        title: "Walnut side table",
        revision: 3,
        document,
        viewSettings,
        canEdit: true,
        updatedAt: "2031-03-10T08:00:00Z",
        updatedBy: null,
        collaborationEnabled: true,
        workspace: {
          __typename: "Workspace",
          id: "20",
          name: "Riverside Makers",
          navigationMode: "PAN",
          role: "OWNER",
        },
      },
    },
  };
}

function renderPreview(answer: (operation: Operation) => object = () => reply()) {
  const scripted = scriptedClient((operation) => answer(operation) as never);
  const view = render(
    <SessionProvider>
      <ApolloProvider client={scripted.client}>
        <MemoryRouter initialEntries={["/app/d/9/preview"]}>
          <Routes>
            <Route path="/app/d/:diagramId/preview" element={<PreviewPage />} />
          </Routes>
        </MemoryRouter>
      </ApolloProvider>
    </SessionProvider>,
  );
  return { ...view, scripted };
}

const surface = () => document.querySelector<HTMLElement>(".preview-canvas");
const phaseOf = (id: string) =>
  document.querySelector(`.react-flow__node[data-id="${id}"] .node`)?.getAttribute("data-reveal");
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** Records every change of a data-reveal attribute, in order, as "id:phase"; `starts()` lists the fade starts so far. */
function recordPhases() {
  const log: string[] = [];
  const take = (records: MutationRecord[]) => {
    for (const record of records) {
      const target = record.target as Element;
      const owner = target.closest("[data-id]");
      if (owner) log.push(`${owner.getAttribute("data-id") ?? ""}:${target.getAttribute("data-reveal") ?? ""}`);
    }
  };
  const observer = new MutationObserver(take);
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-reveal"] });
  onTestFinished(() => observer.disconnect());
  const flush = () => {
    take(observer.takeRecords());
    return log;
  };
  return {
    starts: () => flush().filter((entry) => entry.endsWith(":fading")),
    all: flush,
    clear: () => {
      flush().length = 0;
    },
  };
}

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

describe("PreviewPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts from an empty canvas and reveals steps in reading order, each followed by its connectors", async () => {
    const log = recordPhases();
    renderPreview();
    expect(await screen.findByRole("heading", { name: "Walnut side table" })).toBeInTheDocument();
    expect(surface()).toHaveAttribute("data-reveal-status", "running");
    // At t = 0 only the first step has started to fade in; nothing else is visible.
    expect([phaseOf("n1"), phaseOf("n2"), phaseOf("n3")]).toEqual(["fading", "hidden", "hidden"]);

    // React shows the state at the end of each step, so the steps land inside each fade: n2 fades over 200–450 ms, n3 over 400–650 ms.
    await advance(300);
    expect([phaseOf("n1"), phaseOf("n2"), phaseOf("n3")]).toEqual(["shown", "fading", "hidden"]);
    await advance(150);
    expect(phaseOf("n3")).toBe("fading");
    await advance(300);
    expect(surface()).toHaveAttribute("data-reveal-status", "done");
    expect(log.starts()).toEqual(["n1:fading", "n2:fading", "n3:fading"]);
    expect([phaseOf("n1"), phaseOf("n2"), phaseOf("n3")]).toEqual(["shown", "shown", "shown"]);
    // Each step faded in over 250 ms, ease-out.
    const fades = animations.filter((animation) => animation.keyframes[0]?.opacity === 0);
    expect(fades.map((animation) => animation.target.closest("[data-id]")?.getAttribute("data-id"))).toEqual([
      "n1",
      "n2",
      "n3",
    ]);
    expect(fades[0]?.options).toEqual({ duration: 250, easing: "ease-out" });
  });

  it("skips to the final state at once and cancels every animation; replay produces the same sequence", async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const log = recordPhases();
    renderPreview();
    await screen.findByRole("heading", { name: "Walnut side table" });
    await advance(320);
    expect(runningAnimations().length).toBeGreaterThan(0);
    const firstRun = log.starts();

    await user.click(screen.getByRole("button", { name: /Skip/ }));
    expect(surface()).toHaveAttribute("data-reveal-status", "done");
    expect(runningAnimations()).toEqual([]);
    expect([phaseOf("n1"), phaseOf("n2"), phaseOf("n3")]).toEqual(["shown", "shown", "shown"]);
    expect(screen.getByRole("button", { name: /Skip/ })).toBeDisabled();

    log.clear();
    await user.click(screen.getByRole("button", { name: /Replay/ }));
    expect([phaseOf("n1"), phaseOf("n2"), phaseOf("n3")]).toEqual(["fading", "hidden", "hidden"]);
    await advance(220);
    await advance(200);
    await advance(330);
    const replay = log.starts();
    expect(replay.slice(0, firstRun.length)).toEqual(firstRun);
    expect(replay).toEqual(["n1:fading", "n2:fading", "n3:fading"]);
  });

  it("skips when the person clicks the canvas", async () => {
    renderPreview();
    await screen.findByRole("heading", { name: "Walnut side table" });
    const pane = document.querySelector(".react-flow__pane");
    if (!pane) throw new Error("no pane");
    fireEvent.click(pane);
    expect(surface()).toHaveAttribute("data-reveal-status", "done");
  });

  it("cancels every timer and animation when the preview goes away", async () => {
    const view = renderPreview();
    await screen.findByRole("heading", { name: "Walnut side table" });
    await advance(320);
    expect(runningAnimations().length).toBeGreaterThan(0);
    view.unmount();
    expect(runningAnimations()).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not replay when the data is fetched again; new steps simply appear", async () => {
    const log = recordPhases();
    let loads = 0;
    const { scripted } = renderPreview(() => {
      loads += 1;
      return loads === 1
        ? reply()
        : reply({ ...DOCUMENT, nodes: [...DOCUMENT.nodes, step("n4", 360, "Apply an oil finish")] });
    });
    await screen.findByRole("heading", { name: "Walnut side table" });
    await advance(750);
    log.clear();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(scripted.operations.filter((operation) => operation.operationName === "Diagram")).toHaveLength(2);
    expect(await screen.findByText("Apply an oil finish")).toBeInTheDocument();
    expect(surface()).toHaveAttribute("data-reveal-status", "done");
    expect(phaseOf("n4")).toBe("shown");
    expect(log.all().filter((entry) => entry.endsWith(":hidden"))).toEqual([]);
  });

  it("shows the final state at once for people who prefer reduced motion", async () => {
    reduceMotion();
    renderPreview();
    await screen.findByRole("heading", { name: "Walnut side table" });
    expect(surface()).toHaveAttribute("data-reveal-status", "idle");
    expect([phaseOf("n1"), phaseOf("n2"), phaseOf("n3")]).toEqual(["shown", "shown", "shown"]);
    expect(animations).toEqual([]);
    expect(screen.getByRole("button", { name: /Replay/ })).toBeDisabled();
  });

  it("does not animate when the diagram has the animation switched off", async () => {
    renderPreview(() => reply(DOCUMENT, { ...SETTINGS, animateOnOpen: false }));
    await screen.findByRole("heading", { name: "Walnut side table" });
    expect(surface()).toHaveAttribute("data-reveal-status", "idle");
    expect(phaseOf("n2")).toBe("shown");
  });

  it("is read-only: nothing can be moved, connected, selected, edited or deleted", async () => {
    renderPreview(() => reply(DOCUMENT, { ...SETTINGS, animateOnOpen: false }));
    await screen.findByRole("heading", { name: "Walnut side table" });
    const node = document.querySelector<HTMLElement>('.react-flow__node[data-id="n2"]');
    if (!node) throw new Error("no node");
    expect(node).not.toHaveClass("draggable");
    expect(node).not.toHaveClass("selectable");
    expect(node).not.toHaveAttribute("tabindex");
    for (const handle of node.querySelectorAll(".react-flow__handle")) expect(handle).not.toHaveClass("connectable");
    // jsdom cannot run the canvas library's pointer handling, so plain events stand in for the gestures.
    fireEvent.doubleClick(screen.getByText("Cut the joints"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Cut the joints"));
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(screen.getByText("Cut the joints")).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Add to diagram" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Edit/ })).toHaveAttribute("href", "/app/d/9");
  });

  it("explains a diagram that cannot be opened", async () => {
    renderPreview(() => new Error("down"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/reach the server/);
  });
});
