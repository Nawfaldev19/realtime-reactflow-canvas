import type { Corner, FlatEngine, FlatGraph, LayoutEdge, LayoutOptions } from "./types";

// Groups are laid out as compound blocks, bottom-up, with any flat engine:
// a group's children are laid out first (only the connectors between them
// count), the group is sized to fit them plus an inset, and then the group
// takes part in its parent's layout as a single box. A connector that leaves
// a group is lifted to the ancestors that are siblings at each level, so a
// connector from a step inside group G to a step outside it pulls G as a
// whole. The engine itself never sees nesting.

export interface TreeNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** null for a leaf; a group's children otherwise (an empty group keeps its size). */
  readonly children: readonly TreeNode[] | null;
}

export interface LayoutTree {
  readonly roots: readonly TreeNode[];
  readonly edges: readonly LayoutEdge[];
}

export interface CompoundResult {
  /** Top-left corners relative to the parent group (top level: relative to the layout's origin). */
  readonly positions: Readonly<Record<string, Corner>>;
  /** New sizes of the groups that hold children. */
  readonly sizes: Readonly<Record<string, { readonly width: number; readonly height: number }>>;
}

/** Room between a group's frame and its children; the top leaves space for the group's title. */
export const GROUP_INSET = { side: 25, top: 45, bottom: 25 } as const;

export function layoutCompound(tree: LayoutTree, engine: FlatEngine, options: LayoutOptions): CompoundResult {
  const parentOf = new Map<string, string | null>();
  const visit = (nodes: readonly TreeNode[], parent: string | null) => {
    for (const node of nodes) {
      parentOf.set(node.id, parent);
      if (node.children) visit(node.children, node.id);
    }
  };
  visit(tree.roots, null);

  /** The ancestor-or-self of `id` whose parent is `owner`, or null when `id` is not inside `owner`. */
  const memberUnder = (id: string, owner: string | null): string | null => {
    for (
      let current: string | null = id;
      current !== null && parentOf.has(current);
      current = parentOf.get(current) ?? null
    ) {
      if (parentOf.get(current) === owner) return current;
    }
    return null;
  };

  const positions: Record<string, Corner> = {};
  const sizes: Record<string, { width: number; height: number }> = {};

  const layoutLevel = (members: readonly TreeNode[], owner: string | null): { width: number; height: number } => {
    const boxes = members.map((member) => {
      if (!member.children || member.children.length === 0)
        return { id: member.id, width: member.width, height: member.height };
      const content = layoutLevel(member.children, member.id);
      const size = {
        width: content.width + GROUP_INSET.side * 2,
        height: content.height + GROUP_INSET.top + GROUP_INSET.bottom,
      };
      sizes[member.id] = size;
      for (const child of member.children) {
        const corner = positions[child.id] as Corner;
        positions[child.id] = { x: corner.x + GROUP_INSET.side, y: corner.y + GROUP_INSET.top };
      }
      return { id: member.id, ...size };
    });
    const edges: LayoutEdge[] = [];
    for (const edge of tree.edges) {
      const source = memberUnder(edge.source, owner);
      const target = memberUnder(edge.target, owner);
      if (source !== null && target !== null && source !== target) edges.push({ source, target });
    }
    const graph: FlatGraph = { nodes: boxes, edges };
    const placement = engine(graph, options);
    let width = 0;
    let height = 0;
    for (const box of boxes) {
      const corner = placement[box.id] ?? { x: 0, y: 0 };
      positions[box.id] = corner;
      width = Math.max(width, corner.x + box.width);
      height = Math.max(height, corner.y + box.height);
    }
    return { width, height };
  };

  layoutLevel(tree.roots, null);
  return { positions, sizes };
}
