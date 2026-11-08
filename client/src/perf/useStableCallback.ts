import { useLayoutEffect, useRef, useState } from "react";
import { perfFlags } from "./flags";

/**
 * A function whose identity never changes and that always calls the latest
 * `callback`. Handlers built with it can close over anything without
 * dependency lists, and passing them to the canvas library never makes it
 * update its store or re-render its node wrappers.
 *
 * With the `no-stable` debug flag the callback is returned as is, so a fresh
 * closure reaches the canvas on every render (the behaviour being measured).
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
  stable = perfFlags.stable,
): (...args: Args) => Result {
  const latest = useRef(callback);
  // Updated after render, before any event can run, so a handler never sees a stale closure.
  useLayoutEffect(() => {
    latest.current = callback;
  });
  const [fixed] = useState(
    () =>
      (...args: Args) =>
        latest.current(...args),
  );
  return stable ? fixed : callback;
}
