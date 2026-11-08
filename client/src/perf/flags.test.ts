import { describe, expect, it } from "vitest";
import { ALL_ON, disabledTechniques, offFlag, parsePerfFlags, perfFlags, perfSearch, TECHNIQUES } from "./flags";

describe("performance switches", () => {
  it("turns every technique on by default and ignores unknown flags", () => {
    expect(parsePerfFlags("")).toEqual(ALL_ON);
    expect(parsePerfFlags("?size=500&no-such-thing&memo=0")).toEqual(ALL_ON);
    // Tests run without query flags, so the app sees the defaults.
    expect(perfFlags).toEqual(ALL_ON);
  });

  it("turns off each technique named by a no- flag, with or without a value", () => {
    expect(parsePerfFlags("?no-memo&no-visible=1")).toEqual({ ...ALL_ON, memo: false, visible: false });
    for (const technique of TECHNIQUES) expect(parsePerfFlags(`?${offFlag(technique)}`)[technique]).toBe(false);
  });

  it("lists the switched-off techniques in declaration order", () => {
    expect(disabledTechniques({ ...ALL_ON, stable: false, memo: false })).toEqual(["memo", "stable"]);
    expect(disabledTechniques(ALL_ON)).toEqual([]);
  });

  it("writes query strings that read back to the same switches and keep other parameters", () => {
    const flags = { ...ALL_ON, guards: false, batch: false };
    const search = perfSearch(flags, "stress&size=2000&no-memo");
    expect(search).toBe("?stress&size=2000&no-guards&no-batch");
    expect(parsePerfFlags(search)).toEqual(flags);
    expect(perfSearch(ALL_ON)).toBe("");
  });
});
