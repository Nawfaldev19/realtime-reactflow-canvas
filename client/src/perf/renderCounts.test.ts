import { afterEach, describe, expect, it } from "vitest";
import { countRender, renderSummary, resetCounts, startCounting, stopCounting } from "./renderCounts";

afterEach(stopCounting);

describe("render counters", () => {
  it("counts nothing until counting starts", () => {
    countRender("frame", "a");
    startCounting();
    expect(renderSummary().frame).toEqual({ total: 0, ids: {} });
  });

  it("counts renders per kind and per id, and resets", () => {
    startCounting();
    countRender("frame", "a");
    countRender("frame", "a");
    countRender("frame", "b");
    countRender("root");
    const summary = renderSummary();
    expect(summary.frame).toEqual({ total: 3, ids: { a: 2, b: 1 } });
    expect(summary.root).toEqual({ total: 1, ids: { "": 1 } });
    expect(summary.edge.total).toBe(0);
    resetCounts();
    expect(renderSummary().frame.total).toBe(0);
    countRender("content", "a");
    expect(renderSummary().content.total).toBe(1);
  });

  it("stops counting and starts from zero again", () => {
    startCounting();
    countRender("edge", "e");
    stopCounting();
    countRender("edge", "e");
    expect(renderSummary().edge.total).toBe(1);
    startCounting();
    expect(renderSummary().edge.total).toBe(0);
  });
});
