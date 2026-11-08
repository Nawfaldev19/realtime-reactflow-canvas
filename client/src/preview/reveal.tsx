import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import type { RevealController } from "../reveal/controller";
import type { ConnectorPhase, NodePhase } from "../reveal/timeline";
import { REVEAL_TIMING } from "../reveal/timeline";

// The bridge between the reveal controller and the renderers. Nodes and
// connectors read their phase through these hooks (only elements whose phase
// changed re-render) and run their own Web Animations, handing each one to
// the controller so Skip, Replay and unmount cancel it. Outside a preview
// there is no controller and everything is simply shown.
//
// The line draw is the dash technique: with L the path's measured length
// (SVGGeometryElement.getTotalLength), the dash pattern grows from "L L" to
// "2L 2L" while the dash offset stays at L. The visible part of the first
// period is then d − L for dash length d, growing linearly from 0 to L, so the
// stroke extends from the source to the target. Nothing is kept after the
// animation (no fill), so the connector's own dash style returns by itself.

const RevealContext = createContext<RevealController | null>(null);

export function RevealProvider({ controller, children }: { controller: RevealController; children: ReactNode }) {
  return <RevealContext.Provider value={controller}>{children}</RevealContext.Provider>;
}

const noSubscription = () => () => undefined;
const shown = () => "shown" as const;

export function useNodePhase(id: string): NodePhase {
  const controller = useContext(RevealContext);
  return useSyncExternalStore(
    controller?.subscribe ?? noSubscription,
    controller ? () => controller.nodePhase(id) : shown,
  );
}

export function useConnectorPhase(id: string): ConnectorPhase {
  const controller = useContext(RevealContext);
  return useSyncExternalStore(
    controller?.subscribe ?? noSubscription,
    controller ? () => controller.connectorPhase(id) : shown,
  );
}

/**
 * Runs `start` while `active`, registering the animation with the controller;
 * cancels it when the phase moves on or the element unmounts.
 */
function useTrackedAnimation<T extends Element>(
  ref: RefObject<T>,
  active: boolean,
  start: (element: T) => Animation | null,
) {
  const controller = useContext(RevealContext);
  // The recipe is read when the phase changes; a new function object on each render must not restart the animation.
  const recipe = useRef(start);
  recipe.current = start;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !controller || !element) return;
    const animation = recipe.current(element);
    if (!animation) return;
    const untrack = controller.track(animation);
    animation.addEventListener("finish", untrack);
    return () => {
      untrack();
      animation.cancel();
    };
  }, [active, controller, ref]);
}

const fade = (duration: number, easing: string) => (element: Element) =>
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });

/** Fades a node in (250 ms, ease-out) while its phase is "fading". */
export function useNodeFade(ref: RefObject<HTMLElement>, phase: NodePhase) {
  useTrackedAnimation(ref, phase === "fading", fade(REVEAL_TIMING.fade, "ease-out"));
}

/** Fades a connector label in (150 ms) when its phase reaches "labelling". */
export function useLabelFade(ref: RefObject<HTMLElement>, phase: ConnectorPhase) {
  useTrackedAnimation(ref, phase === "labelling", fade(REVEAL_TIMING.labelFade, "linear"));
}

/** Draws a connector from its source end while its phase is "drawing" (400 ms, linear); a zero-length path is not drawn. */
export function useLineDraw(ref: RefObject<SVGPathElement>, phase: ConnectorPhase) {
  useTrackedAnimation(ref, phase === "drawing" || phase === "labelling", (path) => {
    const length = path.getTotalLength();
    if (!(length > 0)) return null;
    const L = String(length);
    const L2 = String(2 * length);
    return path.animate(
      [
        { strokeDasharray: `${L} ${L}`, strokeDashoffset: L },
        { strokeDasharray: `${L2} ${L2}`, strokeDashoffset: L },
      ],
      { duration: REVEAL_TIMING.draw, easing: "linear" },
    );
  });
}
