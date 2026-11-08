import { describe, expect, it } from "vitest";
import { seededRandom } from "../test/random";
import {
  EMPTY_MEMORY,
  GuideIndex,
  anchorValue,
  boxGap,
  findGuide,
  guideColor,
  isCentreAnchor,
  parseColor,
  snapMove,
  snapResize,
  viewportBox,
  type GuideMemory,
  type GuideSource,
  type SearchOptions,
} from "./guides";
import type { Box } from "./vector";

const source = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 50,
  color: string | null = null,
): GuideSource => ({ id, box: { x, y, width, height }, color });

const OPTIONS: Omit<SearchOptions, "subject"> = {
  radius: 8,
  viewport: null,
  excluded: new Set(),
  referenceId: null,
  nearest: 2,
};

const values = (index: GuideIndex, orientation: "horizontal" | "vertical") =>
  index.range(orientation, -Infinity, Infinity).map((guide) => guide.value);
/** The steps the index holds. */
const owners = (index: GuideIndex) =>
  new Set(index.range("vertical", -Infinity, Infinity).map((guide) => guide.ownerId));

describe("anchors", () => {
  it("computes the six anchor values of a box", () => {
    const box: Box = { x: 10, y: 20, width: 100, height: 40 };
    expect(
      ["top", "middle", "bottom", "left", "centre", "right"].map((anchor) => anchorValue(box, anchor as never)),
    ).toEqual([20, 40, 60, 10, 60, 110]);
    expect(isCentreAnchor("middle")).toBe(true);
    expect(isCentreAnchor("centre")).toBe(true);
    expect(isCentreAnchor("left")).toBe(false);
  });
});

describe("GuideIndex", () => {
  it("keeps both orientations sorted and skips zero-size or non-finite steps", () => {
    const index = GuideIndex.build([
      source("b", 300, 100),
      source("a", 0, 0),
      source("flat", 5, 5, 0, 10),
      source("nan", Number.NaN, 0),
    ]);
    expect(owners(index)).toEqual(new Set(["a", "b"]));
    expect(values(index, "vertical")).toEqual([0, 50, 100, 300, 350, 400]);
    expect(values(index, "horizontal")).toEqual([0, 25, 50, 100, 125, 150]);
    expect(index.range("vertical", 50, 300).map((guide) => `${guide.ownerId}:${guide.anchor}`)).toEqual([
      "a:centre",
      "a:right",
      "b:left",
    ]);
  });

  it("re-indexes one step at a time and matches a rebuild (property test)", () => {
    const random = seededRandom(7);
    const live = new Map<string, GuideSource>();
    const index = GuideIndex.build([]);
    for (let round = 0; round < 400; round += 1) {
      const id = `n${String(random.int(30))}`;
      if (random.next() < 0.25) {
        index.remove(id);
        live.delete(id);
      } else {
        // Coarse coordinates make equal values (and the duplicate handling) common.
        const entry = source(
          id,
          random.int(20) * 10,
          random.int(20) * 10,
          10 + random.int(5) * 10,
          10 + random.int(5) * 10,
        );
        index.upsert(entry);
        live.set(id, entry);
      }
    }
    const rebuilt = GuideIndex.build(live.values());
    expect(values(index, "vertical")).toEqual(values(rebuilt, "vertical"));
    expect(values(index, "horizontal")).toEqual(values(rebuilt, "horizontal"));
    expect(owners(index)).toEqual(new Set(live.keys()));
  });

  it("drops a step that becomes zero-size and ignores removing an unknown id", () => {
    const index = GuideIndex.build([source("a", 0, 0)]);
    index.remove("missing");
    index.upsert(source("a", 0, 0, 0, 0));
    expect(owners(index).size).toBe(0);
    expect(values(index, "vertical")).toEqual([]);
  });

  it("builds 1,000 steps in a few milliseconds", () => {
    const random = seededRandom(3);
    const sources = Array.from({ length: 1000 }, (_, at) =>
      source(`n${String(at)}`, random.int(5000), random.int(5000)),
    );
    const started = performance.now();
    const index = GuideIndex.build(sources);
    expect(owners(index).size).toBe(1000);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe("viewportBox and boxGap", () => {
  it("converts the viewport transform to canvas coordinates", () => {
    expect(viewportBox({ x: -200, y: 100, zoom: 2 }, 800, 600)).toEqual({ x: 100, y: -50, width: 400, height: 300 });
    expect(viewportBox({ x: 0, y: 0, zoom: 0.5 }, 800, 600)).toEqual({ x: -0, y: -0, width: 1600, height: 1200 });
  });

  it("measures the gap between boxes, 0 when they overlap", () => {
    const a: Box = { x: 0, y: 0, width: 10, height: 10 };
    expect(boxGap(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(0);
    expect(boxGap(a, { x: 13, y: 0, width: 10, height: 10 })).toBe(3);
    expect(boxGap(a, { x: 13, y: 14, width: 10, height: 10 })).toBe(5);
    expect(boxGap({ x: 13, y: 14, width: 10, height: 10 }, a)).toBe(5);
  });
});

describe("findGuide", () => {
  const subject: Box = { x: 4, y: 300, width: 100, height: 50 };
  const search = (overrides: Partial<SearchOptions> = {}): SearchOptions => ({ ...OPTIONS, subject, ...overrides });

  it("finds the nearest line within the radius, and nothing outside it", () => {
    const index = GuideIndex.build([source("b", 0, 0), source("c", 10, 600)]);
    expect(findGuide(index, "vertical", 4, "left", search(), null)).toMatchObject({
      ownerId: "b",
      anchor: "left",
      value: 0,
    });
    expect(findGuide(index, "vertical", 4, "left", search({ radius: 3 }), null)).toBeNull();
  });

  it("ignores excluded steps (the moving step, its descendants and ancestors)", () => {
    const index = GuideIndex.build([source("b", 0, 0), source("c", 10, 600)]);
    expect(findGuide(index, "vertical", 4, "left", search({ excluded: new Set(["b"]) }), null)?.ownerId).toBe("c");
  });

  it("ignores steps outside the viewport", () => {
    const index = GuideIndex.build([source("b", 0, -500), source("c", 10, 600)]);
    const viewport: Box = { x: -100, y: 0, width: 1000, height: 800 };
    expect(findGuide(index, "vertical", 4, "left", search({ viewport }), null)?.ownerId).toBe("c");
    expect(
      findGuide(index, "vertical", 4, "left", search({ viewport: { x: 2000, y: 0, width: 10, height: 10 } }), null),
    ).toBeNull();
  });

  it("keeps only the reference step's guides when one is set", () => {
    const index = GuideIndex.build([source("b", 0, 0), source("far", 6, 2000)]);
    expect(findGuide(index, "vertical", 4, "left", search({ referenceId: "far" }), null)?.ownerId).toBe("far");
  });

  it("lets only the K nearest steps produce guides", () => {
    // Three steps share x = 0; the third-nearest one is the only one exactly aligned.
    const index = GuideIndex.build([source("near", 3, 360), source("mid", 2, 420), source("far", 0, 900)]);
    expect(findGuide(index, "vertical", 0, "left", search({ subject: { ...subject, x: 0 } }), null)?.ownerId).toBe(
      "mid",
    );
    expect(
      findGuide(index, "vertical", 0, "left", search({ subject: { ...subject, x: 0 }, nearest: 3 }), null)?.ownerId,
    ).toBe("far");
    expect(
      findGuide(index, "vertical", 0, "left", search({ subject: { ...subject, x: 0 }, nearest: 1 }), null)?.ownerId,
    ).toBe("near");
  });

  it("orders lines within half a unit by how near their steps are", () => {
    const index = GuideIndex.build([source("close", 4.3, 360), source("exact", 4, 1200)]);
    expect(findGuide(index, "vertical", 4, "left", search(), null)?.ownerId).toBe("close");
    const apart = GuideIndex.build([source("close", 5, 360), source("exact", 4, 1200)]);
    expect(findGuide(apart, "vertical", 4, "left", search(), null)?.ownerId).toBe("exact");
    // Exactly equal lines: the nearer step wins; equal steps fall back to the id.
    const same = GuideIndex.build([source("z", 4, 360), source("a", 4, 360)]);
    expect(findGuide(same, "vertical", 4, "left", search(), null)?.ownerId).toBe("a");
  });

  it("keeps the previous frame's guide while it is still a candidate", () => {
    const index = GuideIndex.build([source("b", 0, 0), source("c", 6, 2000)]);
    const previous = { ownerId: "c", anchor: "left" as const, subject: "left" as const };
    expect(findGuide(index, "vertical", 1, "left", search(), previous)?.ownerId).toBe("c");
    expect(findGuide(index, "vertical", 1, "left", search(), { ...previous, subject: "right" })?.ownerId).toBe("b");
    expect(findGuide(index, "vertical", -3, "left", search(), previous)?.ownerId).toBe("b");
  });
});

describe("snapMove", () => {
  it("makes the dragged left edge equal the target's left edge (acceptance)", () => {
    const index = GuideIndex.build([source("B", 200, 0)]);
    const result = snapMove(index, { x: 206, y: 300, width: 30, height: 40 }, OPTIONS, EMPTY_MEMORY);
    expect(result.box.x).toBe(200);
    expect(result.box.y).toBe(300);
    expect(result.guides.vertical).toMatchObject({ ownerId: "B", anchor: "left", value: 200 });
    expect(result.guides.horizontal).toBeNull();
    expect(result.memory).toEqual({ horizontal: null, vertical: { ownerId: "B", anchor: "left", subject: "left" } });
  });

  it("snaps on both axes and with centre anchors", () => {
    const index = GuideIndex.build([source("B", 0, 0, 100, 100)]);
    const result = snapMove(index, { x: 150, y: 3, width: 20, height: 10 }, OPTIONS, EMPTY_MEMORY);
    expect(result.box).toMatchObject({ x: 150, y: 0 });
    expect(result.guides.horizontal?.anchor).toBe("top");
    const centred = snapMove(index, { x: 43, y: 400, width: 10, height: 10 }, OPTIONS, EMPTY_MEMORY);
    expect(centred.box.x).toBe(45);
    expect(centred.guides.vertical?.anchor).toBe("centre");
  });

  it("engages at the same on-screen distance at every zoom (radius = 8 px / zoom)", () => {
    for (const zoom of [0.5, 1, 2]) {
      const index = GuideIndex.build([source("B", 0, 0)]);
      const radius = 8 / zoom;
      const at = (screenDistance: number) =>
        snapMove(
          index,
          { x: screenDistance / zoom, y: 500, width: 1000, height: 50 },
          { ...OPTIONS, radius },
          EMPTY_MEMORY,
        ).box.x;
      expect(at(7.5)).toBe(0);
      expect(at(8.5)).toBeCloseTo(8.5 / zoom);
    }
  });

  it("does not alternate between two guides 0.3 apart while the pointer moves steadily", () => {
    const index = GuideIndex.build([source("near", 100, 400), source("far", 100.3, 1600)]);
    let memory: GuideMemory = EMPTY_MEMORY;
    const owners: string[] = [];
    for (let x = 106; x >= 94.5; x -= 0.25) {
      const result = snapMove(index, { x, y: 300, width: 40, height: 40 }, OPTIONS, memory);
      memory = result.memory;
      owners.push(result.guides.vertical?.ownerId ?? "none");
    }
    const switches = owners.filter((owner, at) => at > 0 && owner !== owners[at - 1]).length;
    expect(new Set(owners)).toEqual(new Set(["near"]));
    expect(switches).toBe(0);
  });
});

describe("snapResize", () => {
  const index = GuideIndex.build([source("B", 300, 100, 100, 200)]);
  const edges = { left: false, right: true, top: false, bottom: true };

  it("snaps the bottom and right edges from the proposed box (A.bottom = B.bottom)", () => {
    const result = snapResize(index, { x: 0, y: 0, width: 296, height: 305 }, edges, OPTIONS, EMPTY_MEMORY);
    expect(result.box).toEqual({ x: 0, y: 0, width: 300, height: 300 });
    expect(result.guides.horizontal).toMatchObject({ anchor: "bottom", value: 300 });
    expect(result.guides.vertical).toMatchObject({ anchor: "left", value: 300 });
    expect(result.memory.vertical).toEqual({ ownerId: "B", anchor: "left", subject: "right" });
  });

  it("moves the top or left edge to the guide and keeps the opposite edge fixed", () => {
    const result = snapResize(
      index,
      { x: 305, y: 96, width: 200, height: 400 },
      { left: true, right: false, top: true, bottom: false },
      OPTIONS,
      EMPTY_MEMORY,
    );
    expect(result.box).toEqual({ x: 300, y: 100, width: 205, height: 396 });
  });

  it("only uses the moving edges and refuses snaps below the minimum size", () => {
    const onlyRight = snapResize(
      index,
      { x: 0, y: 197, width: 250, height: 50 },
      { left: false, right: true, top: false, bottom: false },
      OPTIONS,
      EMPTY_MEMORY,
    );
    expect(onlyRight.box).toEqual({ x: 0, y: 197, width: 250, height: 50 });
    expect(onlyRight.guides).toEqual({ horizontal: null, vertical: null });
    const tiny = snapResize(
      index,
      { x: 296, y: 90, width: 8, height: 14 },
      { left: false, right: true, top: false, bottom: true },
      OPTIONS,
      EMPTY_MEMORY,
      { width: 10, height: 20 },
    );
    expect(tiny.box).toEqual({ x: 296, y: 90, width: 8, height: 14 });
    expect(tiny.memory).toEqual(EMPTY_MEMORY);
  });
});

describe("guide colours", () => {
  it("parses hex, rgb and rgba colours", () => {
    expect(parseColor("#abc")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor("#11223380")?.a).toBeCloseTo(0.502, 2);
    expect(parseColor(" RGBA(1, 2, 3, 0.5) ")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor("rgb(10,20,30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor("transparent")?.a).toBe(0);
    expect(parseColor("teal")).toBeNull();
  });

  it("uses the fill unless it would vanish, then falls back to the accent (null)", () => {
    expect(guideColor("#2f6b4f")).toBe("#2f6b4f");
    for (const fill of [
      undefined,
      null,
      "",
      "transparent",
      "#ffffff",
      "#f0f5ff",
      "#000",
      "#0f0a05",
      "rgba(200, 10, 10, 0)",
      "teal",
    ]) {
      expect(guideColor(fill)).toBeNull();
    }
  });
});
