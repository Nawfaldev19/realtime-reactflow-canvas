import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DocumentState } from "../document/types";
import { prefersReducedMotion } from "../lib/motion";
import { RevealController, type RevealStatus } from "../reveal/controller";
import { revealOrder } from "../reveal/order";
import { planReveal } from "../reveal/timeline";

// The reveal animation's lifecycle on one preview surface:
// - it plays once, after the opening view is applied, when the diagram asks
//   for it and the person has not asked the system for reduced motion;
// - it never plays again because the data was refetched: only Replay does;
// - Skip (or any interaction) shows the final state;
// - unmounting cancels every timer and animation.

export interface Reveal {
  readonly controller: RevealController;
  readonly status: RevealStatus;
  readonly replay: () => void;
  readonly skip: () => void;
}

export function useReveal(doc: DocumentState, { enabled, ready }: { enabled: boolean; ready: boolean }): Reveal {
  const [controller] = useState(() => new RevealController());
  const status = useSyncExternalStore(controller.subscribe, () => controller.currentStatus);
  const started = useRef(false);
  const latest = useRef(doc);
  latest.current = doc;

  useEffect(() => () => controller.stop(), [controller]);

  // A layout effect, so the first visible frame already has the steps hidden.
  useLayoutEffect(() => {
    if (started.current || !ready) return;
    started.current = true;
    if (enabled && !prefersReducedMotion()) controller.play(planReveal(latest.current, revealOrder(latest.current)));
  }, [controller, enabled, ready]);

  const replay = useCallback(() => {
    if (prefersReducedMotion()) return;
    controller.play(planReveal(latest.current, revealOrder(latest.current)));
  }, [controller]);
  const skip = useCallback(() => controller.skip(), [controller]);

  return { controller, status, replay, skip };
}
