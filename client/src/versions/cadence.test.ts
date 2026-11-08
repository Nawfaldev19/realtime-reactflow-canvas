import { describe, expect, it } from "vitest";
import { node, sampleState, stateOf } from "../test/fixtures";
import { decide, INTERVAL_MS, MAX_EDIT_CREDIT_MS, noteEdit, restart, startCadence, type Cadence } from "./cadence";

const MINUTE = 60_000;

/** Edits at each of the given minutes. */
const editAt = (cadence: Cadence, minutes: readonly number[]) =>
  minutes.reduce((current, minute) => noteEdit(current, minute * MINUTE), cadence);

describe("version cadence", () => {
  const baseline = sampleState();
  const edited = stateOf([...Object.values(baseline.nodes), node("new", { number: 9 })]);

  it("starts with no editing time, and the first edit only starts the clock", () => {
    const cadence = noteEdit(startCadence(baseline), 5 * MINUTE);

    expect(cadence).toEqual({ baseline, editingMs: 0, lastEditAt: 5 * MINUTE });
    expect(decide(cadence, edited)).toBe("wait");
  });

  it("is due after ten minutes of steady editing when something changed", () => {
    const minutes = Array.from({ length: 11 }, (_, index) => index);
    const cadence = editAt(startCadence(baseline), minutes);

    expect(cadence.editingMs).toBe(INTERVAL_MS);
    expect(decide(cadence, edited)).toBe("due");
    expect(decide(editAt(startCadence(baseline), minutes.slice(0, 10)), edited)).toBe("wait");
  });

  it("counts idle time between edits only up to the credit cap", () => {
    const cadence = editAt(startCadence(baseline), [0, 60, 61]);

    expect(cadence.editingMs).toBe(MAX_EDIT_CREDIT_MS + MINUTE);
    expect(decide(cadence, edited)).toBe("wait");
  });

  it("ignores a clock that went backwards", () => {
    expect(editAt(startCadence(baseline), [10, 4]).editingMs).toBe(0);
  });

  it("de-duplicates: due time with an unchanged diagram reports unchanged", () => {
    const cadence = editAt(startCadence(baseline), [0, 2, 4, 6, 8, 10]);

    expect(decide(cadence, baseline)).toBe("unchanged");
    expect(decide(cadence, stateOf(Object.values(baseline.nodes).reverse(), Object.values(baseline.edges)))).toBe(
      "unchanged",
    );
  });

  it("starts over from the captured document, keeping the time of the last edit", () => {
    const cadence = restart(editAt(startCadence(baseline), [0, 2, 4, 6, 8, 10]), edited);

    expect(cadence).toEqual({ baseline: edited, editingMs: 0, lastEditAt: 10 * MINUTE });
    expect(decide(editAt(cadence, [12, 14, 16, 18, 20]), edited)).toBe("unchanged");
  });

  it("takes a custom interval", () => {
    expect(decide(editAt(startCadence(baseline), [0, 1]), edited, MINUTE)).toBe("due");
  });
});
