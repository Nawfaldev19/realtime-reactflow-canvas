import { describe, expect, it } from "vitest";
import { node, stateOf } from "../test/fixtures";
import { EXPORT_MARGIN, exportArea, fileName, generatedStamp, PIXEL_BUDGET, planPdf, withinBudget } from "./plan";

describe("export plan", () => {
  it("adds the margin around the diagram, and has nothing to export for an empty one", () => {
    expect(exportArea({ x: 0, y: 10, width: 100, height: 50 })).toEqual({
      x: -EXPORT_MARGIN,
      y: 10 - EXPORT_MARGIN,
      width: 180,
      height: 130,
    });
    expect(exportArea(null)).toBeNull();
    expect(planPdf(stateOf([]), "letter", "portrait")).toBeNull();
  });

  it("keeps a narrow diagram at 100% and centres it (worked example)", () => {
    // One 180-wide step: area 260 wide; Letter content width 756 → scale 1, offset (756 − 260) / 2 = 248.
    const plan = planPdf(stateOf([node("a", { size: { width: 180, height: 64 } })]), "letter", "portrait");
    expect(plan?.scale).toBe(1);
    expect(plan?.offsetX).toBe(248);
    expect(plan?.slices).toEqual([{ top: 0, bottom: 144 }]);
  });

  it("scales a wide diagram to the page width and slices a tall one into pages without cutting steps", () => {
    // 21 steps 1432 wide, every 200 units: area 1512 wide → scale 0.5 on Letter (756 / 1512).
    const steps = Array.from({ length: 21 }, (_, index) =>
      node(`s${String(index)}`, { position: { x: 0, y: index * 200 }, size: { width: 1432, height: 120 } }),
    );
    const plan = planPdf(stateOf(steps), "letter", "portrait");
    if (!plan) throw new Error("plan expected");
    expect(plan.scale).toBe(0.5);
    // Steps in page pixels: top = (200 i + 40) × 0.5 = 100 i + 20, 60 tall. Usable height 946.
    for (const slice of plan.slices) expect(slice.bottom - slice.top).toBeLessThanOrEqual(plan.frame.usableHeight);
    for (let index = 0; index < 21; index += 1) {
      const top = 100 * index + 20;
      expect(plan.slices.some((slice) => slice.top <= top && top + 60 <= slice.bottom)).toBe(true);
    }
    expect(plan.slices).toHaveLength(3);
    // Landscape swaps the page: content 996 wide, 706 tall.
    expect(planPdf(stateOf(steps), "letter", "landscape")?.frame).toEqual({ contentWidth: 996, usableHeight: 706 });
  });

  it("checks the pixel budget", () => {
    expect(withinBudget(1000, 1000, 2)).toBe(true);
    expect(withinBudget(PIXEL_BUDGET, 1, 2)).toBe(false);
  });

  it("names files after the title", () => {
    expect(fileName("Build a walnut side table", "pdf")).toBe("build-a-walnut-side-table.pdf");
    expect(fileName("  Café — plan #2 ", "png")).toBe("cafe-plan-2.png");
    expect(fileName("!!!", "png")).toBe("diagram.png");
  });

  it("stamps the generation time", () => {
    expect(generatedStamp(new Date(2026, 9, 17, 14, 5))).toBe("Generated on 17 Oct 2026, 14:05; may be out of date");
  });
});
