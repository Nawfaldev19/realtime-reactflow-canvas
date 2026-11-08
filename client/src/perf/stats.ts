// Summary statistics for the benchmark's samples (frame intervals, handler
// times). Percentiles use the nearest-rank method on the sorted samples, so
// every reported value is one that was actually measured.

export interface SampleSummary {
  readonly count: number;
  readonly median: number;
  readonly p95: number;
  readonly max: number;
  readonly mean: number;
}

/** Nearest-rank percentile (p in 0–100) of already sorted samples; NaN for none. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil((Math.min(100, Math.max(0, p)) / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)] ?? Number.NaN;
}

export function summarize(samples: readonly number[]): SampleSummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.at(-1) ?? Number.NaN,
    mean: sorted.length === 0 ? Number.NaN : total / sorted.length,
  };
}

/** Frames slower than one and a half 60 Hz intervals: at least one refresh was missed. */
export const JANK_THRESHOLD_MS = 25;

export const jankyFrames = (samples: readonly number[]): number =>
  samples.filter((value) => value > JANK_THRESHOLD_MS).length;

/** Median of a list of numbers (the benchmark's repeats); NaN for none. */
export const median = (values: readonly number[]): number =>
  percentile(
    [...values].sort((a, b) => a - b),
    50,
  );
