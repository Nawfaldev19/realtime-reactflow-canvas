import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LandingPage } from "./LandingPage";
import { TOUR } from "./tour";

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage guided tour", () => {
  it("has one stop per hero feature, each with something to try", () => {
    expect(TOUR.map((stop) => stop.id)).toEqual([
      "orthogonal",
      "route-styles",
      "guides",
      "collaboration",
      "reveal",
      "line",
      "groups",
      "performance",
    ]);
    for (const stop of TOUR) expect(stop.tryIt.length).toBeGreaterThan(0);
  });

  it("starts at the first stop with Back disabled", () => {
    renderLanding();
    const tour = screen.getByRole("region", { name: "Take the tour" });

    expect(within(tour).getByText(`Stop 1 of ${String(TOUR.length)}`)).toBeInTheDocument();
    expect(within(tour).getByRole("heading", { name: TOUR[0]?.title })).toBeInTheDocument();
    expect(within(tour).getByRole("button", { name: /Back/ })).toBeDisabled();
    expect(within(tour).getByRole("button", { name: `1. ${TOUR[0]?.title ?? ""}` })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("moves forward and back, and ends with a way into the demo", async () => {
    const user = userEvent.setup();
    renderLanding();
    const tour = screen.getByRole("region", { name: "Take the tour" });

    await user.click(within(tour).getByRole("button", { name: /Next/ }));
    expect(within(tour).getByRole("heading", { name: TOUR[1]?.title })).toBeInTheDocument();
    await user.click(within(tour).getByRole("button", { name: /Back/ }));
    expect(within(tour).getByRole("heading", { name: TOUR[0]?.title })).toBeInTheDocument();

    for (let step = 1; step < TOUR.length; step += 1)
      await user.click(within(tour).getByRole("button", { name: /Next/ }));

    expect(within(tour).getByText(`Stop ${String(TOUR.length)} of ${String(TOUR.length)}`)).toBeInTheDocument();
    expect(within(tour).queryByRole("button", { name: /Next/ })).not.toBeInTheDocument();
    expect(within(tour).getByRole("link", { name: "Start trying it" })).toHaveAttribute("href", "/sign-in");
  });

  it("jumps straight to a stop from the numbered list", async () => {
    const user = userEvent.setup();
    renderLanding();
    const stop = TOUR[4];

    await user.click(screen.getByRole("button", { name: `5. ${stop?.title ?? ""}` }));

    expect(screen.getByRole("heading", { name: stop?.title })).toBeInTheDocument();
    expect(screen.getByText(stop?.tryIt[0] ?? "")).toBeInTheDocument();
  });
});
