import { RotateCcw, SkipForward } from "lucide-react";
import { prefersReducedMotion } from "../lib/motion";
import type { Reveal } from "./useReveal";

/** Replay (restart from an empty canvas) and Skip (show the final state now), in the preview footer. */
export function RevealControls({ reveal }: { reveal: Reveal }) {
  const reduced = prefersReducedMotion();
  return (
    <div className="view-footer__group" role="group" aria-label="Build-up animation">
      <button
        type="button"
        className="button button-ghost button-small"
        onClick={reveal.replay}
        disabled={reduced}
        title={
          reduced
            ? "Animations are off because your system asks for reduced motion"
            : "Build the diagram up again from the start"
        }
      >
        <RotateCcw size={16} aria-hidden="true" /> Replay
      </button>
      <button
        type="button"
        className="button button-ghost button-small"
        onClick={reveal.skip}
        disabled={reveal.status !== "running"}
        title="Show the whole diagram now"
      >
        <SkipForward size={16} aria-hidden="true" /> Skip
      </button>
    </div>
  );
}
