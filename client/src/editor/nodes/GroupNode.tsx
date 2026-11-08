import { useConnection } from "@xyflow/react";
import { Trash2, Ungroup } from "lucide-react";
import { groupBackground } from "../../document/colors";
import { isAncestor, parentsOf } from "../../document/groups";
import { boxStyle } from "../../document/nodeData";
import { cornerRadius } from "../../document/nodeKinds";
import { useEditor, useEditorStoreApi } from "../EditorStoreContext";
import { nodeFrame, type NodeBodyProps } from "./nodeFrame";
import { NodeShell } from "./NodeShell";
import { InlineTextEditor } from "./InlineTextEditor";

// A group frames its children, which live in its coordinate space and move
// with it. Its background draws below the edge layer (see flowAdapter). It
// has the same four connection handles as other nodes, hidden while a
// connection is being dragged from one of its own children (an edge between
// a group and its child is refused). A selected group offers "Ungroup", or
// "Delete" when it is empty.

const DEFAULT_BORDER = 1;

function GroupNodeView({ id, node, selected }: NodeBodyProps) {
  const api = useEditorStoreApi();
  const canEdit = useEditor((state) => state.canEdit);
  // One set per document for all groups, instead of a scan of every node per group on every store change.
  const empty = useEditor((state) => !parentsOf(state.doc).has(id));
  const connectingFrom = useConnection((connection) => (connection.inProgress ? connection.fromNode.id : null));
  const fromChild = useEditor((state) => connectingFrom !== null && isAncestor(state.doc, id, connectingFrom));
  const style = boxStyle(node);
  const background = groupBackground(style.fill, style.opacity);
  const borderWidth = style.borderWidth ?? DEFAULT_BORDER;

  const release = () => {
    const state = api.getState();
    if (empty) {
      state.deleteElements([id], []);
      return;
    }
    state.setSelection([id], []);
    state.ungroupSelection();
  };

  return (
    <NodeShell node={node} selected={selected} handlesHidden={fromChild}>
      <div
        className="node-group"
        style={{
          borderRadius: cornerRadius("group", node.size.height),
          borderWidth,
          ...(background ? { background } : {}),
          ...(style.stroke ? { borderColor: style.stroke } : {}),
          ...(style.borderStyle ? { borderStyle: style.borderStyle } : {}),
        }}
      >
        <InlineTextEditor node={node} chrome={0} layout="title" />
      </div>
      {canEdit && selected && (
        <button type="button" className="button button-secondary node-group__release nodrag nopan" onClick={release}>
          {empty ? <Trash2 size={14} aria-hidden="true" /> : <Ungroup size={14} aria-hidden="true" />}
          {empty ? "Delete" : "Ungroup"}
        </button>
      )}
    </NodeShell>
  );
}

export const GroupNode = nodeFrame(GroupNodeView);
