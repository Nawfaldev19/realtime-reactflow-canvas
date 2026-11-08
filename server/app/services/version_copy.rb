# Deep-copies a version's document for a new diagram. Every node and edge gets
# a fresh id; every reference is rewritten through the id map built first:
#
# - each child's parent group id (so children stay inside their copied group);
# - each edge's source and target;
# - the ids that key the manual arrangement kept while an automatic layout is on.
#
# Stable identity keys are kept unchanged, so compare and reference repair can
# line the copy up with the original. A reference that is not in the map is
# reported in the copy log: a child loses its parent (it moves to the top
# level), and an edge or a layout entry whose endpoint is missing is left out,
# because the stored document must never hold a dangling reference.
class VersionCopy
  Result = Data.define(:document, :log)

  def self.call(document, new_id: -> { SecureRandom.uuid }) = new(document, new_id).call

  def initialize(document, new_id)
    @document = document
    @new_id = new_id
    @log = []
  end

  def call
    nodes = Array(@document["nodes"])
    edges = Array(@document["edges"])
    @node_ids = nodes.to_h { |node| [node["id"], @new_id.call] }
    @edge_ids = edges.to_h { |edge| [edge["id"], @new_id.call] }

    copy = @document.merge("nodes" => nodes.map { |node| copy_node(node) }, "edges" => edges.filter_map { |edge| copy_edge(edge) })
    copy["layout"] = copy_layout(@document["layout"]) if @document["layout"]
    Result.new(document: copy, log: @log)
  end

  private

  def copy_node(node)
    copy = node.merge("id" => @node_ids.fetch(node["id"]))
    parent = node["parentId"]
    return copy if parent.nil?

    copy.merge("parentId" => @node_ids.fetch(parent) { missing("Step #{node['number']} lost its group #{parent}") })
  end

  def copy_edge(edge)
    source = @node_ids[edge["source"]]
    target = @node_ids[edge["target"]]
    return missing("A connector to a missing step (#{edge['source']} → #{edge['target']}) was left out") unless source && target

    edge.merge("id" => @edge_ids.fetch(edge["id"]), "source" => source, "target" => target)
  end

  def copy_layout(layout)
    manual = layout["manual"] || {}
    nodes = remap_keys(manual["nodes"], @node_ids, "step")
    edges = remap_keys(manual["edges"], @edge_ids, "connector")
    layout.merge("manual" => { "nodes" => nodes, "edges" => edges })
  end

  def remap_keys(entries, ids, noun)
    (entries || {}).each_with_object({}) do |(id, value), result|
      next missing("The saved arrangement of a missing #{noun} (#{id}) was left out") unless ids.key?(id)

      result[ids[id]] = value
    end
  end

  def missing(message)
    @log << message
    nil
  end
end
