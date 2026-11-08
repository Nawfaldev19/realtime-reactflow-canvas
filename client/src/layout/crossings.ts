// Counting edge crossings between two adjacent layers.
//
// Put each edge's two ends at their positions in their layers, sort the edges
// by the upper position (then the lower one), and the crossings are exactly
// the inversions of the resulting sequence of lower positions: two edges cross
// when one starts further left but ends further right. Inversions are counted
// with a Fenwick (binary indexed) tree in O(E log V), the accumulation idea of
// Barth, Jünger and Mutzel, "Simple and efficient bilayer cross counting"
// (2002).

export interface Segment {
  /** Position of the end in the upper layer. */
  readonly upper: number;
  /** Position of the end in the lower layer. */
  readonly lower: number;
}

export function bilayerCrossings(segments: readonly Segment[], lowerLayerSize: number): number {
  const sorted = [...segments].sort((a, b) => a.upper - b.upper || a.lower - b.lower);
  const tree = new Array<number>(lowerLayerSize + 1).fill(0);
  let inserted = 0;
  let crossings = 0;
  for (const { lower } of sorted) {
    // Edges already inserted (smaller upper) whose lower end is strictly right of this one cross it.
    let atMost = 0;
    for (let at = lower + 1; at > 0; at -= at & -at) atMost += tree[at] as number;
    crossings += inserted - atMost;
    for (let at = lower + 1; at <= lowerLayerSize; at += at & -at) tree[at] = (tree[at] as number) + 1;
    inserted += 1;
  }
  return crossings;
}
