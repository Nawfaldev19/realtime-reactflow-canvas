// jsdom implements neither the Web Animations API nor SVG geometry. These
// stand-ins record every animation the reveal starts, so component tests can
// check what ran and that everything was cancelled.

export class AnimationStub extends EventTarget {
  cancelled = false;
  finished = false;

  constructor(
    readonly target: Element,
    readonly keyframes: Keyframe[],
    readonly options: KeyframeAnimationOptions,
  ) {
    super();
  }

  cancel(): void {
    this.cancelled = true;
  }

  /** Ends the animation the way a browser does when its time is up. */
  finish(): void {
    this.finished = true;
    this.dispatchEvent(new Event("finish"));
  }
}

export const animations: AnimationStub[] = [];

/** Animations that are neither finished nor cancelled. */
export const runningAnimations = (): AnimationStub[] =>
  animations.filter((animation) => !animation.cancelled && !animation.finished);

export const PATH_LENGTH = 120;

export function installAnimationStubs(): void {
  Element.prototype.animate = function animate(
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    const animation = new AnimationStub(
      this,
      Array.isArray(keyframes) ? keyframes : [],
      typeof options === "object" ? options : {},
    );
    animations.push(animation);
    return animation as unknown as Animation;
  };
  // jsdom has no SVGPathElement; every SVG element answers instead.
  (SVGElement.prototype as SVGElement & { getTotalLength: () => number }).getTotalLength = () => PATH_LENGTH;
}
