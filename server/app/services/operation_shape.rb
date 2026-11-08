# Checks an incoming collaborative operation before it is applied: the
# envelope (known type, ids, bounded batches, the client's operation format in
# client/src/document/operations.ts) and the type of every field it carries.
# A node or edge that is added must have every field of the client's model
# with the right type; an update may carry only known fields, each with the
# right type. Strings anywhere in the operation are bounded. So OperationApplier
# and DiagramDocument only ever see well-typed values and cannot raise on one.
# The content of the resulting document (references, parents, kind-specific
# keys) is then checked by DiagramDocument, exactly as for a whole-document save.
#
# client/src/collab/protocol.ts (`decodeOperation`) checks the same envelope
# on operations the client receives.
module OperationShape
  Shape = DiagramDocument::Shape

  LEAF_TYPES = %w[node.add node.update node.remove edge.add edge.update edge.remove layout.set].freeze
  MAX_DEPTH = 8
  MAX_LEAVES = 20_000
  # No string in an operation is longer than the longest node text.
  MAX_STRING = NodeContentRules::MAX_TEXT

  OBJECT = ->(value) { value.is_a?(Hash) }

  NODE_FIELD_RULES = {
    "key" => ->(value) { Shape.identifier?(value) },
    "kind" => ->(value) { DiagramDocument::NODE_KINDS.include?(value) },
    "number" => ->(value) { Shape.positive_integer?(value) },
    "position" => ->(value) { Shape.point?(value) },
    "size" => ->(value) { Shape.size?(value) && Shape.within?(value, DiagramDocument::MAX_NODE_SIZE) },
    "parentId" => ->(value) { value.nil? || Shape.identifier?(value) },
    "z" => ->(value) { value.is_a?(Integer) },
    "style" => OBJECT,
    "data" => OBJECT
  }.freeze

  EDGE_FIELD_RULES = {
    "key" => ->(value) { Shape.identifier?(value) },
    "kind" => ->(value) { DiagramDocument::EDGE_KINDS.include?(value) },
    "source" => ->(value) { Shape.identifier?(value) },
    "target" => ->(value) { Shape.identifier?(value) },
    "sourceSide" => ->(value) { DiagramDocument::SIDES.include?(value) },
    "targetSide" => ->(value) { DiagramDocument::SIDES.include?(value) },
    "route" => ->(value) { Shape.route?(value) },
    "label" => ->(value) { value.nil? || value.is_a?(Hash) },
    "style" => OBJECT
  }.freeze

  NODE_FIELDS = NODE_FIELD_RULES.keys.freeze
  EDGE_FIELDS = EDGE_FIELD_RULES.keys.freeze

  module_function

  # Returns a list of problems; an empty list means the operation can be applied.
  def errors(operation)
    problems = []
    leaves = [0]
    check(operation, 0, problems, leaves)
    problems << "has more than #{MAX_LEAVES} changes" if leaves.first > MAX_LEAVES
    problems << "has a text longer than #{MAX_STRING} characters" if problems.empty? && long_string?(operation)
    problems.first(DiagramDocument::MAX_REPORTED_ERRORS)
  end

  def check(operation, depth, problems, leaves)
    return problems << "must be an object with a known type" unless operation.is_a?(Hash) && known_type?(operation["type"])
    return check_batch(operation, depth, problems, leaves) if operation["type"] == "batch"

    leaves[0] += 1
    problem = leaf_problem(operation)
    problems << "#{operation['type']} #{problem}" if problem
  end

  def known_type?(type) = type == "batch" || LEAF_TYPES.include?(type)

  def check_batch(operation, depth, problems, leaves)
    return problems << "batch is nested too deeply" if depth >= MAX_DEPTH
    return problems << "batch needs a list of operations" unless operation["ops"].is_a?(Array)

    operation["ops"].each { |inner| check(inner, depth + 1, problems, leaves) }
  end

  def leaf_problem(operation)
    case operation["type"]
    when "node.add" then node_problem(operation["node"])
    when "edge.add" then edge_problem(operation["edge"])
    when "node.update" then update_problem(operation, NODE_FIELD_RULES)
    when "edge.update" then update_problem(operation, EDGE_FIELD_RULES)
    when "layout.set" then layout_problem(operation)
    else "needs an id" unless Shape.identifier?(operation["id"])
    end
  end

  def layout_problem(operation)
    "needs a layout object or null" unless operation.key?("layout") && (operation["layout"].nil? || operation["layout"].is_a?(Hash))
  end

  def node_problem(node)
    entity_problem(node, NODE_FIELD_RULES) || NodeContentRules.errors(node).first
  end

  def edge_problem(edge)
    entity_problem(edge, EDGE_FIELD_RULES) || EdgeContentRules.errors(edge).first
  end

  # An added entity has exactly the client's fields: an id and every field of the rule table.
  def entity_problem(entity, rules)
    return "needs an object with an id" unless entity.is_a?(Hash) && Shape.identifier?(entity["id"])
    return "has unknown fields" unless (entity.keys - ["id", *rules.keys]).empty?

    missing = rules.keys - entity.keys
    return "is missing #{missing.join(', ')}" if missing.any?

    field_problem(entity, rules)
  end

  def update_problem(operation, rules)
    return "needs an id" unless Shape.identifier?(operation["id"])

    fields = operation["fields"]
    return "needs a fields object" unless fields.is_a?(Hash)
    return "has unknown fields" unless (fields.keys - rules.keys).empty?

    field_problem(fields, rules)
  end

  def field_problem(values, rules)
    invalid = rules.keys.select { |key| values.key?(key) && !rules[key].call(values[key]) }
    return if invalid.empty?

    invalid == ["data"] ? "needs a data object" : "has an invalid #{invalid.join(', ')}"
  end

  def long_string?(value)
    case value
    when String then value.size > MAX_STRING
    when Hash then value.any? { |key, inner| long_string?(key) || long_string?(inner) }
    when Array then value.any? { |inner| long_string?(inner) }
    else false
    end
  end
end
