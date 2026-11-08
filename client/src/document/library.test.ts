import { describe, expect, it } from "vitest";
import { LIBRARY, decodeLibraryPayload, encodeLibraryPayload, filterLibrary } from "./library";

describe("shape library", () => {
  it("offers every shape outline and coloured notes", () => {
    const items = LIBRARY.flatMap((section) => section.items);
    expect(
      items
        .filter((item) => item.kind === "shape")
        .map((item) => item.shape)
        .sort(),
    ).toEqual(["circle", "cylinder", "diamond", "hexagon", "parallelogram", "triangle"]);
    expect(items.filter((item) => item.kind === "note").every((item) => typeof item.style?.fill === "string")).toBe(
      true,
    );
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it("filters by every word of the query across names, descriptions and section titles", () => {
    expect(filterLibrary(LIBRARY, "")).toEqual(LIBRARY);
    expect(filterLibrary(LIBRARY, "  HEXAGON ").flatMap((section) => section.items.map((item) => item.id))).toEqual([
      "shape-hexagon",
    ]);
    expect(filterLibrary(LIBRARY, "flow yes").flatMap((section) => section.items.map((item) => item.id))).toEqual([
      "decision",
    ]);
    expect(filterLibrary(LIBRARY, "nothing-like-this")).toEqual([]);
  });

  it("round-trips a payload and rejects anything else", () => {
    expect(decodeLibraryPayload(encodeLibraryPayload({ kind: "shape", shape: "circle" }))).toEqual({
      kind: "shape",
      shape: "circle",
    });
    expect(decodeLibraryPayload(encodeLibraryPayload({ kind: "note", style: { fill: "#fff3b0" } }))).toEqual({
      kind: "note",
      style: { fill: "#fff3b0" },
    });
    expect(decodeLibraryPayload(JSON.stringify({ kind: "note", style: { fill: 3, stroke: "#000" } }))).toEqual({
      kind: "note",
      style: { stroke: "#000" },
    });
    for (const text of [
      "",
      "x",
      "null",
      JSON.stringify({ kind: "blob" }),
      JSON.stringify({ kind: "sketch" }),
      JSON.stringify({ kind: "shape", shape: "star" }),
    ]) {
      expect(decodeLibraryPayload(text)).toBeNull();
    }
  });
});
