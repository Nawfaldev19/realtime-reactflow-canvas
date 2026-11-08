import { describe, expect, it } from "vitest";
import { DEFAULT_STRESS_SIZE, stressAvailable, stressSize } from "./access";

describe("stress page access", () => {
  it("is always available in development and needs the flag in production", () => {
    expect(stressAvailable(true, "")).toBe(true);
    expect(stressAvailable(false, "")).toBe(false);
    expect(stressAvailable(false, "?stress")).toBe(true);
    expect(stressAvailable(false, "?size=500&stress=1")).toBe(true);
  });

  it("reads the size, falling back to the default", () => {
    expect(stressSize("?size=2000")).toBe(2000);
    expect(stressSize("?size=123")).toBe(DEFAULT_STRESS_SIZE);
    expect(stressSize("")).toBe(DEFAULT_STRESS_SIZE);
  });
});
