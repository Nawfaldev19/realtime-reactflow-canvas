# Applies a collaborative operation to a stored document. A port of
# `applyOperation` in client/src/document/operations.ts, rule for rule, so the
# server and every client reach the same document from the same operations in
# the same order. Shared cases in test/fixtures/files/operation_cases.json are
# run by both test suites.
#
# The rules:
# - an operation that cannot apply (an update to a missing node, an edge to a
#   missing endpoint, a parent that is not a group or would create a cycle) is
#   skipped and counted, never raised;
# - removing a node also removes its nested children and every attached edge;
# - `data` is merged per top-level key; on the wire a null value removes a key
#   (JSON has no `undefined`);
# - a batch applies its operations in order.
#
# Pure: takes and returns plain hashes, touches no database.
class OperationApplier
  Result = Data.define(:document, :skipped, :changed)

  # Each leaf type, with the method that applies it and the keys it reads.
  LEAVES = {
    "node.add" => [:apply_node_add, "node"],
    "node.update" => [:apply_node_update, "id", "fields"],
    "node.remove" => [:apply_node_remove, "id"],
    "edge.add" => [:apply_edge_add, "edge"],
    "edge.update" => [:apply_edge_update, "id", "fields"],
    "edge.remove" => [:apply_edge_remove, "id"],
    "layout.set" => [:replace_layout, "layout"]
  }.freeze

  def self.apply(document, operation) = new(document).apply(operation)

  def initialize(document)
    @nodes = document.fetch("nodes", []).index_by { |node| node["id"] }
    @edges = document.fetch("edges", []).index_by { |edge| edge["id"] }
    @next_number = document.fetch("nextNumber", 1)
    @layout = document["layout"]
    @original = serialize
    @skipped = 0
  end

  def apply(operation)
    run(operation)
    document = serialize
    Result.new(document: document, skipped: @skipped, changed: document != @original)
  end

  private

  def run(operation)
    return operation["ops"].each { |inner| run(inner) } if operation["type"] == "batch"

    method, *keys = LEAVES.fetch(operation["type"])
    send(method, *operation.values_at(*keys))
  end

  # Counts a leaf operation that could not apply.
  def skip
    @skipped += 1
  end

  def group?(id) = !id.nil? && @nodes.dig(id, "kind") == "group"

  def cycle?(id, parent_id)
    current = parent_id
    seen = Set.new
    until current.nil? || !seen.add?(current)
      return true if current == id

      current = @nodes.dig(current, "parentId")
    end
    false
  end

  def apply_node_add(node)
    return skip if @nodes.key?(node["id"]) || !(node["parentId"].nil? || group?(node["parentId"]))

    @nodes[node["id"]] = node
    @next_number = [@next_number, node["number"] + 1].max if node["number"].is_a?(Numeric)
  end

  def apply_node_update(id, fields)
    node = @nodes[id]
    return skip unless node
    return skip if !fields["parentId"].nil? && (!group?(fields["parentId"]) || cycle?(id, fields["parentId"]))

    data = fields.key?("data") ? merge_data(node["data"], fields["data"]) : node["data"]
    @nodes[id] = node.merge(fields, "id" => id, "data" => data)
  end

  def merge_data(current, patch)
    current.merge(patch).reject { |key, value| value.nil? && patch.key?(key) }
  end

  def apply_node_remove(id)
    return unless @nodes.key?(id)

    doomed = Set[id, *descendants_of(id)]
    @nodes.reject! { |node_id, _| doomed.include?(node_id) }
    @edges.reject! { |_, edge| doomed.include?(edge["source"]) || doomed.include?(edge["target"]) }
  end

  def descendants_of(group_id)
    children = @nodes.values.reject { |node| node["parentId"].nil? }.group_by { |node| node["parentId"] }
    result = []
    queue = Array(children[group_id]).pluck("id")
    until queue.empty?
      id = queue.shift
      result << id
      queue.concat(Array(children[id]).pluck("id"))
    end
    result
  end

  def apply_edge_add(edge)
    return skip if @edges.key?(edge["id"]) || !endpoints?(edge)

    @edges[edge["id"]] = edge
  end

  def apply_edge_update(id, fields)
    edge = @edges[id]
    return skip unless edge

    updated = edge.merge(fields, "id" => id)
    return skip unless endpoints?(updated)

    @edges[id] = updated
  end

  def apply_edge_remove(id) = @edges.delete(id)
  def replace_layout(layout) = @layout = layout

  def endpoints?(edge) = @nodes.key?(edge["source"]) && @nodes.key?(edge["target"])

  def serialize
    document = { "schemaVersion" => DiagramDocument::SCHEMA_VERSION, "nodes" => DiagramDocument.parents_first(@nodes),
                 "edges" => @edges.values, "nextNumber" => @next_number }
    document["layout"] = @layout unless @layout.nil?
    document
  end
end
