import { describe, expect, it } from "vitest";
import { node, stateOf } from "../test/fixtures";
import { seededRandom } from "../test/random";
import {
  blocksOf,
  documentUnits,
  GROUP_TITLE_BAND,
  MAX_DEPTH,
  packPages,
  pageFrame,
  pageSize,
  paginate,
  type Interval,
  type Unit,
} from "./pagination";

const leaf = (top: number, bottom: number): Unit => ({ top, bottom, children: [] });

/** Where page breaks fall: the top of every page after the first. */
const breaksOf = (slices: readonly Interval[]): number[] => slices.slice(1).map((slice) => slice.top);

/** True when no unit of at most a page's height is split between two pages. */
function noneSplit(units: readonly Interval[], slices: readonly Interval[], usable: number): boolean {
  return units.every(
    (unit) =>
      unit.bottom - unit.top > usable || slices.some((slice) => slice.top <= unit.top && unit.bottom <= slice.bottom),
  );
}

describe("paper", () => {
  it("measures pages at 96 px per inch and swaps for landscape", () => {
    expect(pageSize("letter", "portrait")).toEqual({ width: 816, height: 1056 });
    expect(pageSize("letter", "landscape")).toEqual({ width: 1056, height: 816 });
    expect(pageSize("legal", "portrait")).toEqual({ width: 816, height: 1344 });
    expect(pageSize("a3", "portrait")).toEqual({ width: 1123, height: 1584 });
    expect(pageSize("a4", "portrait")).toEqual({ width: 794, height: 1122 });
  });

  it("leaves padding, a footer band and a gap (worked example)", () => {
    // Letter portrait: 816 − 60 = 756 wide; 1056 − 60 − 40 − 10 = 946 tall.
    expect(pageFrame(pageSize("letter", "portrait"))).toEqual({ contentWidth: 756, usableHeight: 946 });
  });
});

describe("blocks", () => {
  it("merges overlapping units and keeps touching ones apart", () => {
    expect(blocksOf([leaf(50, 150), leaf(0, 100), leaf(150, 200)], 1000)).toEqual([
      { top: 0, bottom: 150 },
      { top: 150, bottom: 200 },
    ]);
  });

  it("keeps a group that fits on a page whole, and breaks a taller one into its title band and contents", () => {
    const group: Unit = { top: 0, bottom: 900, children: [leaf(0, 40), leaf(60, 300), leaf(320, 600), leaf(620, 880)] };
    expect(blocksOf([group], 1000)).toEqual([{ top: 0, bottom: 900 }]);
    expect(blocksOf([group], 500)).toEqual([
      { top: 0, bottom: 40 },
      { top: 60, bottom: 300 },
      { top: 320, bottom: 600 },
      { top: 620, bottom: 880 },
    ]);
  });

  it("keeps a tall unit without children as one block", () => {
    expect(blocksOf([leaf(0, 2000)], 500)).toEqual([{ top: 0, bottom: 2000 }]);
  });

  it("breaks a tall overlap cluster into its members' children, keeping leaf members", () => {
    const group: Unit = { top: 0, bottom: 800, children: [leaf(0, 100), leaf(400, 500)] };
    expect(blocksOf([group, leaf(150, 250)], 300)).toEqual([
      { top: 0, bottom: 100 },
      { top: 150, bottom: 250 },
      { top: 400, bottom: 500 },
    ]);
  });

  it("stops breaking down after six levels", () => {
    let unit: Unit = leaf(0, 100);
    for (let level = 0; level < MAX_DEPTH + 2; level += 1) unit = { top: 0, bottom: 1000, children: [unit] };
    expect(blocksOf([unit], 500)).toEqual([{ top: 0, bottom: 1000 }]);
  });
});

describe("packing pages", () => {
  it("is one page for content shorter than a page, and for an empty diagram", () => {
    expect(paginate([leaf(0, 300)], 946, 300)).toEqual([{ top: 0, bottom: 300 }]);
    expect(paginate([], 946, 0)).toEqual([{ top: 0, bottom: 0 }]);
  });

  it("moves a step that straddles the page end to the next page (worked example)", () => {
    // U = 250: steps at 0–100, 120–220, 230–330. The third straddles 250, so page 1 ends at its top.
    const slices = paginate([leaf(0, 100), leaf(120, 220), leaf(230, 330)], 250, 330);
    expect(slices).toEqual([
      { top: 0, bottom: 230 },
      { top: 230, bottom: 330 },
    ]);
    expect(breaksOf(slices)).toEqual([230]);
  });

  it("hard-breaks a block taller than a page at every page length", () => {
    expect(packPages([{ top: 0, bottom: 600 }], 250, 600)).toEqual([
      { top: 0, bottom: 250 },
      { top: 250, bottom: 500 },
      { top: 500, bottom: 600 },
    ]);
  });

  it("continues contiguously after a small gap", () => {
    expect(
      packPages(
        [
          { top: 0, bottom: 100 },
          { top: 260, bottom: 400 },
        ],
        250,
        400,
      ),
    ).toEqual([
      { top: 0, bottom: 250 },
      { top: 250, bottom: 400 },
    ]);
  });

  it("skips empty space taller than a page instead of printing blank pages", () => {
    expect(
      packPages(
        [
          { top: 0, bottom: 100 },
          { top: 1000, bottom: 1100 },
        ],
        250,
        1100,
      ),
    ).toEqual([
      { top: 0, bottom: 250 },
      { top: 1000, bottom: 1100 },
    ]);
    // Blank space at the top of the first page is skipped too.
    expect(packPages([{ top: 300, bottom: 400 }], 250, 400)).toEqual([{ top: 300, bottom: 400 }]);
    expect(packPages([{ top: 10, bottom: 260 }], 250, 260)).toEqual([{ top: 10, bottom: 260 }]);
  });

  it("hard-breaks a tall block that starts after a gap", () => {
    expect(
      packPages(
        [
          { top: 0, bottom: 100 },
          { top: 260, bottom: 600 },
        ],
        250,
        600,
      ),
    ).toEqual([
      { top: 0, bottom: 250 },
      { top: 250, bottom: 500 },
      { top: 500, bottom: 600 },
    ]);
  });

  it("never splits any of 200 rows of varying height, and the pages are the breaks plus one", () => {
    const random = seededRandom(5);
    const rows: Unit[] = [];
    let y = 0;
    for (let row = 0; row < 200; row += 1) {
      const height = 20 + random.int(120);
      rows.push(leaf(y, y + height));
      y += height + random.int(3);
    }
    const slices = paginate(rows, 946, y);
    expect(noneSplit(rows, slices, 946)).toBe(true);
    expect(slices.length).toBe(breaksOf(slices).length + 1);
    // Every row is on some page, pages are in order and none is taller than U.
    for (const slice of slices) expect(slice.bottom - slice.top).toBeLessThanOrEqual(946);
    slices.forEach((slice, index) => {
      if (index > 0) expect(slice.top).toBeGreaterThanOrEqual(slices[index - 1]?.bottom ?? 0);
    });
  });

  it("covers every unit in random layouts (property)", () => {
    const random = seededRandom(9);
    for (let run = 0; run < 100; run += 1) {
      const units = Array.from({ length: 1 + random.int(30) }, () => {
        const top = random.int(3000);
        return leaf(top, top + 10 + random.int(400));
      });
      const total = Math.max(...units.map((unit) => unit.bottom));
      const slices = paginate(units, 300, total);
      const blocks = blocksOf(units, 300);
      expect(noneSplit(blocks, slices, 300)).toBe(true);
      for (const unit of units) {
        // Each point of the unit lies on a page.
        for (let at = unit.top; at < unit.bottom; at += 5)
          expect(slices.some((slice) => slice.top <= at && at < slice.bottom + 1e-9)).toBe(true);
      }
    }
  });
});

describe("units from the document", () => {
  it("measures absolute positions from the origin and scales them, with groups holding a title band and contents", () => {
    const doc = stateOf([
      node("group", { kind: "group", position: { x: 0, y: 200 }, size: { width: 300, height: 400 } }),
      node("child", { parentId: "group", position: { x: 20, y: 60 }, size: { width: 100, height: 50 } }),
      node("top", { position: { x: 0, y: 100 }, size: { width: 100, height: 50 } }),
    ]);
    const units = documentUnits(doc, 100, 0.5);
    expect(units).toEqual([
      {
        top: 50,
        bottom: 250,
        children: [
          { top: 50, bottom: 50 + GROUP_TITLE_BAND * 0.5, children: [] },
          { top: 80, bottom: 105, children: [] },
        ],
      },
      { top: 0, bottom: 25, children: [] },
    ]);
  });

  it("treats a node whose parent is missing as top level and survives parent cycles", () => {
    const doc = stateOf([
      node("orphan", { parentId: "missing", position: { x: 0, y: 10 } }),
      node("a", { kind: "group", parentId: "b" }),
      node("b", { kind: "group", parentId: "a" }),
    ]);
    expect(documentUnits(doc, 0, 1)).toEqual([{ top: 10, bottom: 60, children: [] }]);
  });
});
