import { isStressSize, type StressSize } from "./generate";

// The stress page is a development tool. Production builds serve it only
// with the `stress` query flag, so the benchmark can measure the optimized
// build while ordinary visitors never land on it.

export const STRESS_FLAG = "stress";
export const DEFAULT_STRESS_SIZE: StressSize = 1000;

export function stressAvailable(development: boolean, search: string): boolean {
  return development || new URLSearchParams(search).has(STRESS_FLAG);
}

/** The requested diagram size, or the default for anything that is not one of the stress sizes. */
export function stressSize(search: string): StressSize {
  const size = Number(new URLSearchParams(search).get("size"));
  return isStressSize(size) ? size : DEFAULT_STRESS_SIZE;
}
