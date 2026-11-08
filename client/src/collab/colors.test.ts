import { describe, expect, it } from "vitest";
import { fnv1a } from "../routing/ids";
import {
  contrastRatio,
  DARK_CANVAS,
  hslToHex,
  LIGHT_CANVAS,
  luminanceBand,
  memberColor,
  readableText,
  relativeLuminance,
  TEXT_THRESHOLD,
} from "./colors";

describe("colour arithmetic", () => {
  it("converts HSL to hex like CSS does", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
    expect(hslToHex(120, 100, 50)).toBe("#00ff00");
    expect(hslToHex(240, 100, 50)).toBe("#0000ff");
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
    expect(hslToHex(0, 0, 0)).toBe("#000000");
    expect(hslToHex(210, 65, 50)).toBe("#2d80d2");
  });

  it("computes relative luminance and contrast ratios with the WCAG formulas", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#808080")).toBeCloseTo(0.2158605, 6);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 10);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.4776, 3);
  });

  it("picks black text above the crossover luminance and white below", () => {
    expect(readableText("#ffff00")).toBe("#000000");
    expect(readableText("#0000ff")).toBe("#ffffff");
    // The crossover: black and white give the same contrast at Y = 0.179.
    expect((TEXT_THRESHOLD + 0.05) / 0.05).toBeCloseTo(1.05 / (TEXT_THRESHOLD + 0.05), 1);
  });

  it("finds the luminance band that clears 3:1 against both canvases", () => {
    const { min, max } = luminanceBand();

    expect((min + 0.05) / (relativeLuminance(DARK_CANVAS) + 0.05)).toBeCloseTo(3, 10);
    expect((relativeLuminance(LIGHT_CANVAS) + 0.05) / (max + 0.05)).toBeCloseTo(3, 10);
    expect(min).toBeLessThan(max);
  });
});

describe("memberColor", () => {
  it("is stable for a member id: the hue comes from the hash", () => {
    expect(memberColor("12")).toEqual(memberColor("12"));
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(memberColor("12")).not.toEqual(memberColor("13"));
  });

  it("keeps the hashed colour when it already has enough contrast", () => {
    const id = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].find((candidate) => {
      const base = hslToHex(fnv1a(candidate) % 360, 65, 50);
      const { min, max } = luminanceBand();
      return relativeLuminance(base) > min + 0.01 && relativeLuminance(base) < max - 0.01;
    });
    if (id === undefined) throw new Error("expected one id whose base colour is in the band");

    expect(memberColor(id).color).toBe(hslToHex(fnv1a(id) % 360, 65, 50));
  });

  it("always gives #rrggbb with 3:1 against both canvases and 4.5:1 tag text (property)", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 3000; index += 1) {
      const { color, text } = memberColor(`member-${index}`);
      seen.add(color);

      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastRatio(color, LIGHT_CANVAS)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(color, DARK_CANVAS)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(color, text)).toBeGreaterThanOrEqual(4.5);
    }
    expect(seen.size).toBeGreaterThan(200);
  });
});
