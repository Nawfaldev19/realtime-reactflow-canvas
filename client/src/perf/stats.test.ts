import { describe, expect, it } from "vitest";
import { jankyFrames, JANK_THRESHOLD_MS, median, percentile, summarize } from "./stats";

describe("benchmark statistics", () => {
  it("uses the nearest rank, so every percentile is a measured sample", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(sorted, 50)).toBe(50);
    expect(percentile(sorted, 95)).toBe(100);
    expect(percentile(sorted, 90)).toBe(90);
    expect(percentile(sorted, 0)).toBe(10);
    expect(percentile(sorted, 150)).toBe(100);
    expect(percentile(sorted, -5)).toBe(10);
    expect(percentile([], 50)).toBeNaN();
  });

  it("summarizes unsorted samples without changing them", () => {
    const samples = [16.7, 33.4, 16.6, 16.8];
    expect(summarize(samples)).toEqual({ count: 4, median: 16.7, p95: 33.4, max: 33.4, mean: 20.875 });
    expect(samples).toEqual([16.7, 33.4, 16.6, 16.8]);
    const empty = summarize([]);
    expect(empty.count).toBe(0);
    expect(empty.median).toBeNaN();
    expect(empty.max).toBeNaN();
    expect(empty.mean).toBeNaN();
  });

  it("counts frames that missed at least one 60 Hz refresh", () => {
    expect(jankyFrames([16.7, JANK_THRESHOLD_MS, 25.1, 50])).toBe(2);
  });

  it("takes the median of repeats", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNaN();
  });
});
