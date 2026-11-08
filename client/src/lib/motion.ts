/** True when the person asked the system for less motion; animations then jump to their end. */
export const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
