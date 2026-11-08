import { describe, expect, it, vi } from "vitest";
import type { LayoutTree } from "./compound";
import type { LayoutRequestMessage, LayoutResponseMessage } from "./layeredJob";
import { computeLayered } from "./layeredJob";
import { LatestOnly, STALE, computeLayout, createLayeredClient, type WorkerLike } from "./runner";
import type { LayoutOptions } from "./types";

const OPTIONS: LayoutOptions = { direction: "TB", nodeSep: 80, rankSep: 100 };
const TREE: LayoutTree = {
  roots: [
    { id: "a", width: 100, height: 40, children: null },
    { id: "b", width: 100, height: 40, children: null },
  ],
  edges: [{ source: "a", target: "b" }],
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe("LatestOnly", () => {
  it("drops a result that finishes after a newer run started", async () => {
    const runner = new LatestOnly();
    const slow = deferred<string>();
    const first = runner.run(() => slow.promise);
    const second = runner.run(() => Promise.resolve("second"));
    slow.resolve("first");
    expect(await second).toBe("second");
    expect(await first).toBe(STALE);
  });

  it("drops the running result when cancelled", async () => {
    const runner = new LatestOnly();
    const pending = runner.run(() => Promise.resolve(1));
    runner.cancel();
    expect(await pending).toBe(STALE);
    expect(await runner.run(() => Promise.resolve(2))).toBe(2);
  });
});

class FakeWorker implements WorkerLike {
  readonly sent: LayoutRequestMessage[] = [];
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  postMessage(message: unknown): void {
    this.sent.push(message as LayoutRequestMessage);
  }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe("createLayeredClient", () => {
  it("runs the layered engine on the next task without a worker", async () => {
    const run = createLayeredClient(null);
    const result = await run(TREE, OPTIONS);
    expect(result.positions.b).toEqual({ x: 0, y: 140 });
  });

  it("sends jobs to one worker and matches replies by id", async () => {
    const worker = new FakeWorker();
    const factory = vi.fn(() => worker);
    const run = createLayeredClient(factory);
    const first = run(TREE, OPTIONS);
    const second = run(TREE, { ...OPTIONS, direction: "LR" });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(worker.sent.map((message) => message.id)).toEqual([1, 2]);
    const replies: LayoutResponseMessage[] = worker.sent.map(computeLayered);
    worker.emit("message", { data: replies[1] });
    worker.emit("message", { data: replies[0] });
    expect((await first).positions.b).toEqual({ x: 0, y: 140 });
    expect((await second).positions.b).toEqual({ x: 200, y: 0 });
  });

  it("rejects pending jobs when the worker fails", async () => {
    const worker = new FakeWorker();
    const run = createLayeredClient(() => worker);
    const pending = run(TREE, OPTIONS);
    worker.emit("error", {});
    await expect(pending).rejects.toThrow("The layout worker failed");
  });
});

describe("computeLayout", () => {
  it("uses dagre synchronously and the layered runner otherwise", async () => {
    const layered = vi.fn(createLayeredClient(null));
    expect((await computeLayout(TREE, "dagre", OPTIONS, layered)).positions.b).toEqual({ x: 0, y: 140 });
    expect(layered).not.toHaveBeenCalled();
    await computeLayout(TREE, "layered", OPTIONS, layered);
    expect(layered).toHaveBeenCalledWith(TREE, OPTIONS);
  });
});
