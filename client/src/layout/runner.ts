import type { LayoutEngineName } from "../document/types";
import { layoutCompound, type CompoundResult, type LayoutTree } from "./compound";
import { dagreLayout } from "./dagre";
import { computeLayered, type LayoutRequestMessage, type LayoutResponseMessage } from "./layeredJob";
import type { LayoutOptions } from "./types";

// Running layouts. The fast engine (dagre) runs synchronously; our layered
// engine runs in a web worker, off the main thread. Changing the options while
// a layout is still running must never let the older result land after the
// newer one, so every run gets the next request number and a result is used
// only if its number is still the latest.

export const STALE = Symbol("stale");

export class LatestOnly {
  private latest = 0;

  /** Runs `task`; resolves to STALE when another run started (or cancel() was called) before it finished. */
  async run<T>(task: () => Promise<T>): Promise<T | typeof STALE> {
    this.latest += 1;
    const request = this.latest;
    const value = await task();
    return request === this.latest ? value : STALE;
  }

  cancel(): void {
    this.latest += 1;
  }
}

export type WorkerLike = Pick<Worker, "postMessage" | "addEventListener">;

/**
 * Sends layered layouts to a worker and matches the replies by id. Without a
 * worker (tests, very old browsers) the layout runs on the next task instead,
 * so callers always get a promise either way.
 */
export function createLayeredClient(createWorker: (() => WorkerLike) | null) {
  let worker: WorkerLike | null = null;
  let nextId = 0;
  const pending = new Map<number, { resolve: (result: CompoundResult) => void; reject: (error: Error) => void }>();

  const connect = (factory: () => WorkerLike): WorkerLike => {
    const created = factory();
    created.addEventListener("message", (event: MessageEvent<LayoutResponseMessage>) => {
      pending.get(event.data.id)?.resolve(event.data.result);
      pending.delete(event.data.id);
    });
    created.addEventListener("error", () => {
      for (const entry of pending.values()) entry.reject(new Error("The layout worker failed"));
      pending.clear();
    });
    return created;
  };

  return (tree: LayoutTree, options: LayoutOptions): Promise<CompoundResult> => {
    nextId += 1;
    const message: LayoutRequestMessage = { id: nextId, tree, options };
    if (!createWorker) return new Promise((resolve) => setTimeout(() => resolve(computeLayered(message).result), 0));
    worker ??= connect(createWorker);
    const target = worker;
    return new Promise((resolve, reject) => {
      pending.set(message.id, { resolve, reject });
      target.postMessage(message);
    });
  };
}

export type LayeredRunner = ReturnType<typeof createLayeredClient>;

export function computeLayout(
  tree: LayoutTree,
  engine: LayoutEngineName,
  options: LayoutOptions,
  layered: LayeredRunner,
): Promise<CompoundResult> {
  return engine === "dagre" ? Promise.resolve(layoutCompound(tree, dagreLayout, options)) : layered(tree, options);
}
