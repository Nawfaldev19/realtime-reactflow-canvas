import { bilayerCrossings, type Segment } from "./crossings";
import { normalizePlacement, type Corner, type FlatGraph, type LayoutOptions, type Placement } from "./types";

// Our own layered ("Sugiyama-style") layout, written from the textbook method
// of K. Sugiyama, S. Tagawa and M. Toda, "Methods for visual understanding of
// hierarchical system structures" (IEEE SMC, 1981), in the four classic
// phases, each a separate, tested function:
//
// 1. Cycle removal: a depth-first search in input order reverses every edge
//    that points back to a node still on the stack, so the graph is acyclic.
// 2. Layering by longest path: sources go to layer 0 and every other node to
//    one more than its deepest predecessor, so every edge points downward.
//    Edges spanning several layers get one dummy node per layer crossed.
// 3. Crossing reduction by barycenter sweeps: alternately top-down and
//    bottom-up, each node is placed at the mean position of its neighbours in
//    the layer just processed. The order with the fewest crossings (counted
//    exactly, see crossings.ts) is kept.
// 4. Coordinate assignment: nodes are first packed in order, then pulled
//    toward the mean position of their neighbours in a few alternating
//    passes. Each pass is an order-preserving least-squares fit with minimum
//    separations, solved exactly with the pool-adjacent-violators algorithm
//    for isotonic regression (after shifting each node by the separations in
//    front of it, the constraints become "non-decreasing"). Layers are spaced
//    by their tallest node plus the rank separation.
//
// Disconnected parts are laid out one by one and placed side by side across
// the ranks. Everything is ordered by input position and sorted stably, so the
// same graph always gives the same layout.

/** Two dummy nodes, or a dummy and a node, need less room than two nodes. */
const DUMMY_SEP = 20;
/** Long edges are kept straight: their dummies pull twice as hard. */
const DUMMY_WEIGHT = 2;
const MAX_SWEEPS = 24;
const PATIENCE = 4;
const COORDINATE_ROUNDS = 4;

export interface DirectedEdge {
  readonly from: number;
  readonly to: number;
  /** The edge was turned around to break a cycle. */
  readonly reversed: boolean;
}

/** Edges as index pairs: endpoints must exist, self-loops and repeats are dropped. */
export function indexEdges(graph: FlatGraph): Array<[number, number]> {
  const index = new Map(graph.nodes.map((node, at) => [node.id, at]));
  const seen = new Set<string>();
  const result: Array<[number, number]> = [];
  for (const { source, target } of graph.edges) {
    const from = index.get(source);
    const to = index.get(target);
    if (from === undefined || to === undefined || from === to) continue;
    const key = `${String(from)}>${String(to)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push([from, to]);
  }
  return result;
}

/** Phase 1: reverses the back edges of a depth-first search started from each node in input order. */
export function breakCycles(count: number, edges: ReadonlyArray<readonly [number, number]>): DirectedEdge[] {
  const out: number[][] = Array.from({ length: count }, () => []);
  edges.forEach(([from], at) => out[from]?.push(at));
  const state = new Array<0 | 1 | 2>(count).fill(0);
  const reversed = new Set<number>();
  for (let root = 0; root < count; root += 1) {
    if (state[root] !== 0) continue;
    const stack: Array<{ node: number; next: number }> = [{ node: root, next: 0 }];
    state[root] = 1;
    while (stack.length > 0) {
      const frame = stack[stack.length - 1] as { node: number; next: number };
      const outgoing = out[frame.node] as number[];
      if (frame.next >= outgoing.length) {
        state[frame.node] = 2;
        stack.pop();
        continue;
      }
      const edge = outgoing[frame.next] as number;
      frame.next += 1;
      const target = (edges[edge] as readonly [number, number])[1];
      if (state[target] === 1) reversed.add(edge);
      else if (state[target] === 0) {
        state[target] = 1;
        stack.push({ node: target, next: 0 });
      }
    }
  }
  const result: DirectedEdge[] = [];
  const seen = new Set<string>();
  edges.forEach(([from, to], at) => {
    const flip = reversed.has(at);
    const edge = flip ? { from: to, to: from, reversed: true } : { from, to, reversed: false };
    // u→v and v→u become the same edge once one is reversed; keep it once.
    const key = `${String(edge.from)}>${String(edge.to)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(edge);
  });
  return result;
}

/** Phase 2: the longest-path layer of every node in an acyclic graph (sources in layer 0). */
export function longestPathLayers(count: number, edges: readonly DirectedEdge[]): number[] {
  const indegree = new Array<number>(count).fill(0);
  const out: number[][] = Array.from({ length: count }, () => []);
  for (const { from, to } of edges) {
    out[from]?.push(to);
    indegree[to] = (indegree[to] as number) + 1;
  }
  const layer = new Array<number>(count).fill(0);
  const queue: number[] = [];
  for (let node = 0; node < count; node += 1) if (indegree[node] === 0) queue.push(node);
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head] as number;
    for (const next of out[node] as number[]) {
      layer[next] = Math.max(layer[next] as number, (layer[node] as number) + 1);
      indegree[next] = (indegree[next] as number) - 1;
      if (indegree[next] === 0) queue.push(next);
    }
  }
  return layer;
}

/** The layered graph after dummy nodes are inserted: nodes 0..n−1 are real, the rest are dummies. */
export interface Hierarchy {
  readonly realCount: number;
  readonly layerOf: readonly number[];
  /** Edges between adjacent layers only, as [upper, lower]. */
  readonly links: ReadonlyArray<readonly [number, number]>;
  readonly layerCount: number;
}

export function buildHierarchy(count: number, edges: readonly DirectedEdge[], layers: readonly number[]): Hierarchy {
  const layerOf = [...layers];
  const links: Array<[number, number]> = [];
  for (const { from, to } of edges) {
    let previous = from;
    for (let level = (layers[from] as number) + 1; level < (layers[to] as number); level += 1) {
      const dummy = layerOf.length;
      layerOf.push(level);
      links.push([previous, dummy]);
      previous = dummy;
    }
    links.push([previous, to]);
  }
  return { realCount: count, layerOf, links, layerCount: count === 0 ? 0 : Math.max(...layers) + 1 };
}

function neighbours(hierarchy: Hierarchy): { up: number[][]; down: number[][] } {
  const up: number[][] = hierarchy.layerOf.map(() => []);
  const down: number[][] = hierarchy.layerOf.map(() => []);
  for (const [upper, lower] of hierarchy.links) {
    down[upper]?.push(lower);
    up[lower]?.push(upper);
  }
  return { up, down };
}

/** Total crossings of an ordering: the sum over every pair of adjacent layers. */
export function countCrossings(hierarchy: Hierarchy, order: readonly (readonly number[])[]): number {
  const position = positionsOf(hierarchy, order);
  const perLayer: Segment[][] = order.map(() => []);
  for (const [upper, lower] of hierarchy.links)
    perLayer[hierarchy.layerOf[upper] as number]?.push({
      upper: position[upper] as number,
      lower: position[lower] as number,
    });
  return perLayer.reduce((sum, segments, level) => sum + bilayerCrossings(segments, order[level + 1]?.length ?? 0), 0);
}

function positionsOf(hierarchy: Hierarchy, order: readonly (readonly number[])[]): number[] {
  const position = new Array<number>(hierarchy.layerOf.length).fill(0);
  for (const layer of order) layer.forEach((node, at) => (position[node] = at));
  return position;
}

/** Re-sorts one layer by the mean position of each node's neighbours in the adjacent layer; nodes without neighbours keep their place. */
function barycenterSort(
  layer: readonly number[],
  adjacent: readonly number[][],
  position: readonly number[],
): number[] {
  const keyed = layer.map((node, at) => {
    const linked = adjacent[node] as number[];
    const barycenter =
      linked.length === 0 ? at : linked.reduce((sum, other) => sum + (position[other] as number), 0) / linked.length;
    return { node, barycenter, at };
  });
  keyed.sort((a, b) => a.barycenter - b.barycenter || a.at - b.at);
  return keyed.map((entry) => entry.node);
}

export interface Ordering {
  readonly order: number[][];
  readonly crossings: number;
}

/** Phase 3: barycenter sweeps, alternately down and up, keeping the ordering with the fewest crossings. */
export function reduceCrossings(hierarchy: Hierarchy): Ordering {
  const { up, down } = neighbours(hierarchy);
  let order: number[][] = Array.from({ length: hierarchy.layerCount }, () => []);
  hierarchy.layerOf.forEach((level, node) => order[level]?.push(node));
  let best: Ordering = { order: order.map((layer) => [...layer]), crossings: countCrossings(hierarchy, order) };
  let stale = 0;
  for (let sweep = 0; sweep < MAX_SWEEPS && best.crossings > 0 && stale < PATIENCE; sweep += 1) {
    const downward = sweep % 2 === 0;
    const levels = order.map((_, level) => level);
    if (!downward) levels.reverse();
    for (const level of levels.slice(1)) {
      const position = positionsOf(hierarchy, order);
      order = order.map((layer, at) => (at === level ? barycenterSort(layer, downward ? up : down, position) : layer));
    }
    const crossings = countCrossings(hierarchy, order);
    if (crossings < best.crossings) {
      best = { order: order.map((layer) => [...layer]), crossings };
      stale = 0;
    } else {
      stale += 1;
    }
  }
  return best;
}

/**
 * Isotonic (non-decreasing) least-squares fit by pool adjacent violators:
 * the values closest to `targets` (weighted) such that each is ≥ the previous.
 */
export function isotonicFit(targets: readonly number[], weights: readonly number[]): number[] {
  const blocks: Array<{ value: number; weight: number; size: number }> = [];
  targets.forEach((target, at) => {
    blocks.push({ value: target, weight: weights[at] as number, size: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1] as { value: number; weight: number; size: number };
      const before = blocks[blocks.length - 2] as { value: number; weight: number; size: number };
      if (before.value <= last.value) break;
      const weight = before.weight + last.weight;
      blocks.splice(blocks.length - 2, 2, {
        value: (before.value * before.weight + last.value * last.weight) / weight,
        weight,
        size: before.size + last.size,
      });
    }
  });
  return blocks.flatMap((block) => new Array<number>(block.size).fill(block.value));
}

/** Places one layer's centres as close as possible to `desired`, in order, at least `gaps` apart. */
export function placeInOrder(
  desired: readonly number[],
  gaps: readonly number[],
  weights: readonly number[],
): number[] {
  const offsets: number[] = [];
  let offset = 0;
  desired.forEach((_, at) => {
    if (at > 0) offset += gaps[at - 1] as number;
    offsets.push(offset);
  });
  const fitted = isotonicFit(
    desired.map((value, at) => value - (offsets[at] as number)),
    weights,
  );
  return fitted.map((value, at) => value + (offsets[at] as number));
}

/** Phase 4 (across the ranks): centre coordinates for every node of an ordered hierarchy. */
export function assignCrossCoordinates(
  hierarchy: Hierarchy,
  order: readonly (readonly number[])[],
  breadth: (node: number) => number,
  nodeSep: number,
): number[] {
  const { up, down } = neighbours(hierarchy);
  const isReal = (node: number) => node < hierarchy.realCount;
  const gap = (a: number, b: number) =>
    breadth(a) / 2 + breadth(b) / 2 + (isReal(a) && isReal(b) ? nodeSep : DUMMY_SEP);
  const centre = new Array<number>(hierarchy.layerOf.length).fill(0);
  for (const layer of order) {
    let cursor = 0;
    layer.forEach((node, at) => {
      if (at > 0) cursor += gap(layer[at - 1] as number, node);
      centre[node] = cursor;
    });
  }
  const pass = (layers: readonly (readonly number[])[], adjacent: (node: number) => readonly number[]) => {
    for (const layer of layers) {
      const desired = layer.map((node) => {
        const linked = adjacent(node);
        return linked.length === 0
          ? (centre[node] as number)
          : linked.reduce((sum, other) => sum + (centre[other] as number), 0) / linked.length;
      });
      const gaps = layer.slice(1).map((node, at) => gap(layer[at] as number, node));
      const placed = placeInOrder(
        desired,
        gaps,
        layer.map((node) => (isReal(node) ? 1 : DUMMY_WEIGHT)),
      );
      layer.forEach((node, at) => (centre[node] = placed[at] as number));
    }
  };
  const topDown = order.slice(1);
  const bottomUp = order.slice(0, -1).reverse();
  for (let round = 0; round < COORDINATE_ROUNDS; round += 1) {
    pass(topDown, (node) => up[node] as number[]);
    pass(bottomUp, (node) => down[node] as number[]);
  }
  pass(order, (node) => [...(up[node] as number[]), ...(down[node] as number[])]);
  return centre;
}

/** Weakly connected parts, each listed in input order, ordered by their first node. */
export function components(count: number, edges: ReadonlyArray<readonly [number, number]>): number[][] {
  const parent = Array.from({ length: count }, (_, at) => at);
  const find = (node: number): number => {
    let root = node;
    while (parent[root] !== root) root = parent[root] as number;
    for (let current = node; parent[current] !== root; ) {
      const next = parent[current] as number;
      parent[current] = root;
      current = next;
    }
    return root;
  };
  for (const [a, b] of edges) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const groups = new Map<number, number[]>();
  for (let node = 0; node < count; node += 1) {
    const root = find(node);
    groups.set(root, [...(groups.get(root) ?? []), node]);
  }
  return [...groups.values()];
}

export interface LayeredDetails {
  readonly placement: Placement;
  /** Real node ids per layer, in their final order (dummies left out). */
  readonly layers: readonly (readonly string[])[];
  readonly crossings: number;
}

function layoutComponent(graph: FlatGraph, options: LayoutOptions): LayeredDetails {
  const count = graph.nodes.length;
  const edges = breakCycles(count, indexEdges(graph));
  const hierarchy = buildHierarchy(count, edges, longestPathLayers(count, edges));
  const { order, crossings } = reduceCrossings(hierarchy);
  const horizontal = options.direction === "LR";
  const size = (node: number) => graph.nodes[node] as { width: number; height: number };
  const breadth = (node: number) => (node < count ? (horizontal ? size(node).height : size(node).width) : 0);
  const depth = (node: number) => (node < count ? (horizontal ? size(node).width : size(node).height) : 0);
  const cross = assignCrossCoordinates(hierarchy, order, breadth, options.nodeSep);

  const layerDepth = order.map((layer) => Math.max(0, ...layer.map(depth)));
  const layerStart: number[] = [];
  let main = 0;
  layerDepth.forEach((extent, level) => {
    layerStart.push(main);
    main += extent + (level < layerDepth.length - 1 ? options.rankSep : 0);
  });

  const placement: Record<string, Corner> = {};
  for (let node = 0; node < count; node += 1) {
    const level = hierarchy.layerOf[node] as number;
    const along = (layerStart[level] as number) + ((layerDepth[level] as number) - depth(node)) / 2;
    const across = (cross[node] as number) - breadth(node) / 2;
    placement[(graph.nodes[node] as { id: string }).id] = horizontal
      ? { x: along, y: across }
      : { x: across, y: along };
  }
  const layers = order.map((layer) =>
    layer.filter((node) => node < count).map((node) => (graph.nodes[node] as { id: string }).id),
  );
  return { placement: normalizePlacement(graph, placement), layers, crossings };
}

/** Lays out every connected part and places the parts side by side across the ranks. */
export function layeredLayoutDetails(graph: FlatGraph, options: LayoutOptions): LayeredDetails {
  const parts = components(graph.nodes.length, indexEdges(graph));
  const horizontal = options.direction === "LR";
  const placement: Record<string, Corner> = {};
  const layers: string[][] = [];
  let crossings = 0;
  let offset = 0;
  for (const part of parts) {
    const ids = new Set(part.map((node) => (graph.nodes[node] as { id: string }).id));
    const subgraph: FlatGraph = {
      nodes: graph.nodes.filter((node) => ids.has(node.id)),
      edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    };
    const result = layoutComponent(subgraph, options);
    let extent = 0;
    for (const node of subgraph.nodes) {
      const corner = result.placement[node.id] as Corner;
      placement[node.id] = horizontal ? { x: corner.x, y: corner.y + offset } : { x: corner.x + offset, y: corner.y };
      extent = Math.max(extent, horizontal ? corner.y + node.height : corner.x + node.width);
    }
    offset += extent + options.nodeSep;
    result.layers.forEach((layer, level) => (layers[level] = [...(layers[level] ?? []), ...layer]));
    crossings += result.crossings;
  }
  return { placement, layers, crossings };
}

export const layeredLayout = (graph: FlatGraph, options: LayoutOptions): Placement =>
  layeredLayoutDetails(graph, options).placement;
