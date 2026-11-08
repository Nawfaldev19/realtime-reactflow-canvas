import { describe, expect, it } from "vitest";
import { mergeRecord, reuseList, samePoint, sameSize } from "./guards";

describe("no-op guards", () => {
  it("compares points and sizes by value", () => {
    expect(samePoint({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(samePoint({ x: 1, y: 2 }, { x: 1, y: 3 })).toBe(false);
    expect(sameSize({ width: 4, height: 5 }, { width: 4, height: 5 })).toBe(true);
    expect(sameSize({ width: 4, height: 5 }, { width: 5, height: 5 })).toBe(false);
  });

  it("returns the same record when a patch changes nothing, including an empty patch", () => {
    const current = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } };
    expect(mergeRecord(current, { a: { x: 1, y: 2 } }, samePoint)).toBe(current);
    expect(mergeRecord(current, {}, samePoint)).toBe(current);
  });

  it("merges into a new record when any entry is new or different", () => {
    const current = { a: { x: 1, y: 2 } };
    const moved = mergeRecord(current, { a: { x: 1, y: 3 } }, samePoint);
    expect(moved).not.toBe(current);
    expect(moved).toEqual({ a: { x: 1, y: 3 } });
    expect(mergeRecord(current, { a: { x: 1, y: 2 }, b: { x: 0, y: 0 } }, samePoint)).toEqual({
      a: { x: 1, y: 2 },
      b: { x: 0, y: 0 },
    });
    expect(current).toEqual({ a: { x: 1, y: 2 } });
  });

  it("keeps a list's identity while every entry is the same object", () => {
    const one = { id: 1 };
    const two = { id: 2 };
    const previous = [one, two];
    expect(reuseList(previous, [one, two])).toBe(previous);
    const replaced = [one, { id: 2 }];
    expect(reuseList(previous, replaced)).toBe(replaced);
    const longer = [one, two, one];
    expect(reuseList(previous, longer)).toBe(longer);
    const first = [one];
    expect(reuseList(null, first)).toBe(first);
  });
});
