import { describe, expect, it } from "vitest";
import { node } from "../test/fixtures";
import { outlineOf, portOffsetsOf } from "./nodeGeometry";

const size = { width: 200, height: 100 };

describe("node outlines and ports", () => {
  it("maps each kind to its true outline", () => {
    expect(outlineOf(node("s"), size)).toEqual({ kind: "rounded", radius: 8 });
    expect(outlineOf(node("p", { kind: "start-end" }), size)).toEqual({ kind: "rounded", radius: 50 });
    expect(outlineOf(node("d", { kind: "decision" }), size)).toEqual({ kind: "diamond" });
    expect(outlineOf(node("c", { kind: "shape", data: { shape: "circle" } }), size)).toEqual({ kind: "ellipse" });
    expect(outlineOf(node("m", { kind: "shape", data: { shape: "diamond" } }), size)).toEqual({ kind: "diamond" });
    expect(outlineOf(node("h", { kind: "shape", data: { shape: "triangle" } }), size).kind).toBe("polygon");
    expect(outlineOf(node("x", { kind: "shape", data: {} }), size).kind).toBe("polygon");
    expect(outlineOf(node("n", { kind: "note" }), size)).toEqual({ kind: "rect" });
  });

  it("uses the outline's own ports for decisions and shapes", () => {
    expect(portOffsetsOf(node("s"), size)).toBeUndefined();
    expect(portOffsetsOf(node("d", { kind: "decision" }), size)?.right).toEqual({ x: 200, y: 50 });
    const triangle = portOffsetsOf(node("t", { kind: "shape", data: { shape: "triangle" } }), size);
    expect(triangle?.right.x).toBeLessThan(200);
    expect(portOffsetsOf(node("x", { kind: "shape", data: {} }), size)).toBeDefined();
  });
});
