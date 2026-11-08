import { describe, expect, it } from "vitest";
import { ALL_FILTERS, highlightOf } from "./highlight";

describe("highlightOf", () => {
  it("highlights each change kind while its filter is on, and draws everything else plain", () => {
    expect(
      ["added", "removed", "changed", "unchanged", undefined].map((status) =>
        highlightOf(status as never, ALL_FILTERS),
      ),
    ).toEqual(["added", "removed", "changed", "plain", "plain"]);
  });

  it("fades a filtered-out kind to plain, and hides removed entities when their filter is off", () => {
    const none = { added: false, removed: false, changed: false };

    expect([highlightOf("added", none), highlightOf("changed", none), highlightOf("removed", none)]).toEqual([
      "plain",
      "plain",
      "hidden",
    ]);
  });
});
