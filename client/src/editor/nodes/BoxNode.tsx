import { boxStyle } from "../../document/nodeData";
import { cornerRadius } from "../../document/nodeKinds";
import type { NodeKind } from "../../document/types";
import { nodeFrame, type NodeBodyProps } from "./nodeFrame";
import { NodeShell } from "./NodeShell";
import { InlineTextEditor } from "./InlineTextEditor";

// The everyday rectangular kinds share one body, configured by the kind
// table: step (rounded rectangle), start/end (pill), sticky note and text
// label. Only the radius rule and the default border differ.

/** Vertical padding of the text area, matching .node-text--box in editor.css. */
export const TEXT_PADDING = 8;

const DEFAULT_BORDER: Partial<Record<NodeKind, number>> = { step: 1, "start-end": 1, note: 1, label: 0 };

function BoxNodeView({ node, selected }: NodeBodyProps) {
  const style = boxStyle(node);
  const borderWidth = style.borderWidth ?? DEFAULT_BORDER[node.kind] ?? 1;
  return (
    <NodeShell node={node} selected={selected}>
      <div
        className="node-box"
        style={{
          borderRadius: cornerRadius(node.kind, node.size.height),
          borderWidth,
          ...(style.fill ? { background: style.fill } : {}),
          ...(style.stroke ? { borderColor: style.stroke } : {}),
          ...(style.borderStyle ? { borderStyle: style.borderStyle } : {}),
        }}
      >
        <InlineTextEditor node={node} chrome={TEXT_PADDING * 2 + borderWidth * 2} />
      </div>
    </NodeShell>
  );
}

export const BoxNode = nodeFrame(BoxNodeView);
