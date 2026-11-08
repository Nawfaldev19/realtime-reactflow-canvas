import { describe, expect, it } from "vitest";
import { derivedId, fnv1a, freshId, pointIdBetween } from "./ids";

describe("route ids", () => {
  it("hashes with 32-bit FNV-1a", () => {
    // Published FNV-1a test vectors.
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });

  it("derives short, server-safe ids that depend on every part", () => {
    const id = pointIdBetween("3f8a2c1e-1111-4222-8333-944455556666", "target");
    expect(id).toMatch(/^p[0-9a-f]{8}$/);
    expect(pointIdBetween("a", "b")).not.toBe(pointIdBetween("b", "a"));
    expect(derivedId("v", "x")).toBe(`v${fnv1a("x").toString(16).padStart(8, "0")}`);
  });

  it("avoids ids already taken", () => {
    const first = freshId("seed", new Set());
    const second = freshId("seed", new Set([first]));
    expect(second).not.toBe(first);
    expect(freshId("seed", new Set([first, second]))).not.toBe(second);
  });
});
