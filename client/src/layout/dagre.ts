import dagre from "@dagrejs/dagre";
import { normalizePlacement, type Corner, type FlatGraph, type LayoutOptions, type Placement } from "./types";

// The "fast" engine: the dagre library (MIT, dagrejs) behind our engine
// interface. Dagre reports node centres, so each one is converted to a
// top-left corner (x − w/2, y − h/2) and the layout is moved to start at the
// origin like every other engine's.

export function dagreLayout(graph: FlatGraph, options: LayoutOptions): Placement {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: options.direction,
    nodesep: options.nodeSep,
    ranksep: options.rankSep,
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));
  const known = new Set<string>();
  for (const node of graph.nodes) {
    g.setNode(node.id, { width: node.width, height: node.height });
    known.add(node.id);
  }
  for (const edge of graph.edges) {
    if (known.has(edge.source) && known.has(edge.target) && edge.source !== edge.target)
      g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);
  const corners: Record<string, Corner> = {};
  for (const node of graph.nodes) {
    const label = g.node(node.id) as { x: number; y: number };
    corners[node.id] = { x: label.x - node.width / 2, y: label.y - node.height / 2 };
  }
  return normalizePlacement(graph, corners);
}
