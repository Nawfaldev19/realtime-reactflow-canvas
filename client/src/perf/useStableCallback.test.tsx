import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStableCallback } from "./useStableCallback";

describe("useStableCallback", () => {
  it("keeps one identity across renders and always calls the latest closure", () => {
    const { result, rerender } = renderHook(({ value }) => useStableCallback(() => value), {
      initialProps: { value: 1 },
    });
    const first = result.current;
    expect(first()).toBe(1);
    rerender({ value: 2 });
    expect(result.current).toBe(first);
    expect(result.current()).toBe(2);
  });

  it("passes arguments through", () => {
    const { result } = renderHook(() => useStableCallback((a: number, b: number) => a + b));
    let sum = 0;
    act(() => {
      sum = result.current(2, 3);
    });
    expect(sum).toBe(5);
  });

  it("returns the fresh closure itself when switched off (the no-stable flag)", () => {
    const { result, rerender } = renderHook(({ value }) => useStableCallback(() => value, false), {
      initialProps: { value: 1 },
    });
    const first = result.current;
    rerender({ value: 2 });
    expect(result.current).not.toBe(first);
    expect(result.current()).toBe(2);
  });
});
