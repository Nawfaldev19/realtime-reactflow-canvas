# The persisted diagram document format, version 1. The client owns editing;
# the server checks structure and references so a bad save can never store a
# document that fails to load. The format is described in docs/ARCHITECTURE.md.
# Kind-specific node keys are checked by NodeContentRules, connector style,
# label and point keys by EdgeContentRules, the optional layout by LayoutRules.
module DiagramDocument
  SCHEMA_VERSION = 1
  NODE_KINDS = %w[step decision start-end note label shape line sketch group].freeze
  EDGE_KINDS = %w[connector floating].freeze
  ROUTE_STYLES = %w[polyline spline bezier step].freeze
  SIDES = [nil, "top", "right", "bottom", "left"].freeze
  MAX_BYTES = 2.megabytes
  MAX_NODES = 5000
  MAX_EDGES = 10_000
  MAX_REPORTED_ERRORS = 5
  # The client never sizes a node beyond this (resize handles and the properties panel clamp to it).
  MAX_NODE_SIZE = 2500

  module_function

  def empty
    { "schemaVersion" => SCHEMA_VERSION, "nodes" => [], "edges" => [], "nextNumber" => 1 }
  end

  # Returns a list of problems; an empty list means the document is valid.
  def validate(document)
    return ["must be an object"] unless document.is_a?(Hash)
    return ["is larger than #{MAX_BYTES / 1.megabyte} MB"] if document.to_json.bytesize > MAX_BYTES

    Validator.new(document).errors.first(MAX_REPORTED_ERRORS)
  end

  # Nodes in their stored order: parents before children, by stacking order
  # within a level (the order of `orderedNodes` in client/src/document/serialize.ts).
  # `nodes` is keyed by id; a node whose parent is missing counts as top level.
  def parents_first(nodes)
    by_parent = nodes.values.group_by { |node| nodes.key?(node["parentId"]) ? node["parentId"] : nil }
    by_parent.each_value { |siblings| siblings.sort_by! { |node| [node["z"].to_f, node["number"].to_f, node["id"].to_s] } }
    result = []
    queue = Array(by_parent[nil]).dup
    until queue.empty?
      node = queue.shift
      result << node
      queue.concat(Array(by_parent[node["id"]]))
    end
    result
  end

  # Small predicates shared by the rule tables below.
  module Shape
    module_function

    def identifier?(value) = value.is_a?(String) && value.match?(/\A[\w-]{1,64}\z/)
    def positive_integer?(value) = value.is_a?(Integer) && value.positive?
    def list?(value, max) = value.is_a?(Array) && value.size <= max
    def finite?(value) = value.is_a?(Numeric) && value.to_f.finite?
    def point?(value) = value.is_a?(Hash) && finite?(value["x"]) && finite?(value["y"])

    def size?(value)
      value.is_a?(Hash) && finite?(value["width"]) && finite?(value["height"]) && value["width"].positive? && value["height"].positive?
    end

    def within?(size, limit) = size["width"] <= limit && size["height"] <= limit
    def identified?(entity) = identifier?(entity["id"]) && identifier?(entity["key"])

    def route?(route)
      route.is_a?(Hash) && ROUTE_STYLES.include?(route["style"]) && route["points"].is_a?(Array) &&
        route["points"].all? { |point| point?(point) && identifier?(point["id"]) }
    end
  end

  NODE_RULES = {
    "needs a string id and key" => ->(node) { Shape.identified?(node) },
    "has an unknown kind" => ->(node) { NODE_KINDS.include?(node["kind"]) },
    "needs a positive integer number" => ->(node) { Shape.positive_integer?(node["number"]) },
    "needs a numeric position" => ->(node) { Shape.point?(node["position"]) },
    "needs a positive size" => ->(node) { Shape.size?(node["size"]) },
    "is larger than #{MAX_NODE_SIZE} on a side" => ->(node) { !Shape.size?(node["size"]) || Shape.within?(node["size"], MAX_NODE_SIZE) },
    "needs an integer z" => ->(node) { node["z"].is_a?(Integer) },
    "needs style and data objects" => ->(node) { node["style"].is_a?(Hash) && node["data"].is_a?(Hash) }
  }.freeze

  EDGE_RULES = {
    "needs a string id and key" => ->(edge) { Shape.identified?(edge) },
    "has an unknown kind" => ->(edge) { EDGE_KINDS.include?(edge["kind"]) },
    "has an unknown side" => ->(edge) { SIDES.include?(edge["sourceSide"]) && SIDES.include?(edge["targetSide"]) },
    "needs a valid route" => ->(edge) { Shape.route?(edge["route"]) },
    "needs a style object" => ->(edge) { edge["style"].is_a?(Hash) }
  }.freeze

  class Validator
    attr_reader :errors

    def initialize(document)
      @document = document
      @errors = []
      check_header
      return unless errors.empty?

      nodes = document["nodes"].grep(Hash)
      errors << "every node and edge must be an object" unless nodes.size == document["nodes"].size && document["edges"].all?(Hash)
      check_entities("node", nodes, NODE_RULES)
      check_node_content(nodes)
      check_parents(nodes.index_by { |node| node["id"] })
      check_edges(document["edges"].grep(Hash), nodes.to_set { |node| node["id"] })
      check_layout
    end

    private

    def check_header
      errors << "has an unsupported schemaVersion" unless @document["schemaVersion"] == SCHEMA_VERSION
      errors << "nextNumber must be a positive integer" unless Shape.positive_integer?(@document["nextNumber"])
      errors << "nodes must be a list of at most #{MAX_NODES}" unless Shape.list?(@document["nodes"], MAX_NODES)
      errors << "edges must be a list of at most #{MAX_EDGES}" unless Shape.list?(@document["edges"], MAX_EDGES)
    end

    def check_layout
      errors.concat(LayoutRules.errors(@document["layout"]))
    end

    def check_entities(label, entities, rules)
      ids = Set.new
      entities.each do |entity|
        name = "#{label} #{entity['id'].inspect}"
        errors << "#{name} has a duplicate id" unless ids.add?(entity["id"])
        rules.each { |message, rule| errors << "#{name} #{message}" unless rule.call(entity) }
      end
    end

    def check_node_content(nodes)
      nodes.each do |node|
        NodeContentRules.errors(node).each { |problem| errors << "node #{node['id'].inspect} #{problem}" }
      end
    end

    # A parent must be a group in the same document, and parent chains must end.
    def check_parents(by_id)
      by_id.each_value do |node|
        next if node["parentId"].nil?

        name = "node #{node['id'].inspect}"
        next errors << "#{name} has a parent that is not a group" unless by_id.dig(node["parentId"], "kind") == "group"

        errors << "#{name} is inside a parent cycle" if cyclic?(node, by_id)
      end
    end

    def cyclic?(node, by_id)
      seen = Set[node["id"]]
      current = by_id[node["parentId"]]
      while current
        return true unless seen.add?(current["id"])

        current = by_id[current["parentId"]]
      end
      false
    end

    def check_edges(edges, node_ids)
      check_entities("edge", edges, EDGE_RULES)
      edges.each do |edge|
        EdgeContentRules.errors(edge).each { |problem| errors << "edge #{edge['id'].inspect} #{problem}" }
        next if node_ids.include?(edge["source"]) && node_ids.include?(edge["target"])

        errors << "edge #{edge['id'].inspect} must connect two nodes in this diagram"
      end
    end
  end
end
