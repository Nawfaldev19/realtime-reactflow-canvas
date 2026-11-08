import { describe, expect, it, vi } from "vitest";
import { CancellationToken } from "./cancellation";

describe("cancellation token", () => {
  it("runs every registered cleanup once on cancel", () => {
    const token = new CancellationToken();
    const first = vi.fn();
    const second = vi.fn();
    token.add(first);
    token.add(second);
    expect(token.pending).toBe(2);
    token.cancel();
    token.cancel();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(token.isCancelled).toBe(true);
    expect(token.pending).toBe(0);
  });

  it("forgets cleanups that were unregistered", () => {
    const token = new CancellationToken();
    const cleanup = vi.fn();
    const unregister = token.add(cleanup);
    unregister();
    token.cancel();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("runs a cleanup at once when added after cancellation", () => {
    const token = new CancellationToken();
    token.cancel();
    const cleanup = vi.fn();
    token.add(cleanup)();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(token.pending).toBe(0);
  });
});
