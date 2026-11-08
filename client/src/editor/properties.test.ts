import { describe, expect, it } from "vitest";
import { formatNumber, parseNumber, sharedValue } from "./properties";

describe("panel helpers", () => {
  it("finds the value all items share, deeply, or null", () => {
    expect(sharedValue([{ w: 1 }, { w: 1 }], (item) => item.w)).toBe(1);
    expect(sharedValue([{ s: { a: 1 } }, { s: { a: 1 } }], (item) => item.s)).toEqual({ a: 1 });
    expect(sharedValue([{ w: 1 }, { w: 2 }], (item) => item.w)).toBeNull();
    expect(sharedValue([] as { w: number }[], (item) => item.w)).toBeNull();
  });

  it("parses number fields, treating 0 as a value and blank or junk as nothing", () => {
    expect(parseNumber("0")).toBe(0);
    expect(parseNumber(" 12.5 ")).toBe(12.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("Infinity")).toBeNull();
  });

  it("formats to two decimals and blank for mixed values", () => {
    expect(formatNumber(1.23456)).toBe("1.23");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(null)).toBe("");
  });
});
