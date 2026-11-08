import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { StressPage } from "./StressPage";

afterEach(() => {
  delete window.__liveCanvasStress;
});

describe("stress page", () => {
  it("renders the generated diagram in the editor canvas and exposes the probe for the benchmark", async () => {
    render(
      <MemoryRouter>
        <StressPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Stress test" })).toBeInTheDocument();
    expect(screen.getByText(/1,000 nodes, 1,0\d\d connectors, \d+ groups/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1,000" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "2,000" })).toHaveAttribute("href", "/stress?stress&size=2000");
    // Each technique link reloads the page with that technique switched off.
    expect(screen.getByRole("link", { name: "Memoized node content: on" })).toHaveAttribute(
      "href",
      "/stress?stress&size=1000&no-memo",
    );

    await waitFor(() => expect(window.__liveCanvasStress?.ready).toBe(true));
    const probe = window.__liveCanvasStress;
    expect(probe?.size).toBe(1000);
    expect(probe?.counts.nodes).toBe(1000);
    expect(probe?.initialRenderMs).toBeGreaterThan(0);
    // Visible-only rendering: jsdom's 500 × 500 canvas at 100% shows a handful of the 1,000 nodes.
    const mounted = probe?.mountedNodes() ?? 0;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(100);
    expect(probe?.operations()).toBe(0);
    expect(probe?.renders().root.total).toBeGreaterThan(0);
    probe?.resetRenders();
    expect(probe?.renders().root.total).toBe(0);
    expect(screen.getByText(/first render \d+ ms/)).toBeInTheDocument();
  });
});
