# Checks the optional `layout` key of a document: present only while an
# automatic layout is shown, it names the engine and direction and keeps the
# manual arrangement ("Manual" restores it). The client reads the same shape in
# client/src/document/serialize.ts.
module LayoutRules
  ENGINES = %w[dagre layered].freeze
  DIRECTIONS = %w[TB LR].freeze

  Shape = DiagramDocument::Shape

  module_function

  # Problems with the layout, as phrases ("layout has an unknown engine"); nil is manual mode.
  def errors(layout)
    return [] if layout.nil?
    return ["layout must be an object"] unless layout.is_a?(Hash)

    problems = []
    problems << "layout has an unknown engine" unless ENGINES.include?(layout["engine"])
    problems << "layout has an unknown direction" unless DIRECTIONS.include?(layout["direction"])
    problems + manual_errors(layout["manual"])
  end

  def manual_errors(manual)
    return ["layout.manual must be an object"] unless manual.is_a?(Hash)

    [*entries_errors(manual["nodes"], DiagramDocument::MAX_NODES, "nodes") { |entry| placement?(entry) },
     *entries_errors(manual["edges"], DiagramDocument::MAX_EDGES, "edges") { |entry| edge_placement?(entry) }]
  end

  def entries_errors(entries, limit, name, &valid)
    return ["layout.manual.#{name} must be an object of at most #{limit} entries"] unless entries.is_a?(Hash) && entries.size <= limit

    bad = entries.count { |id, entry| !(Shape.identifier?(id) && valid.call(entry)) }
    return [] if bad.zero?

    ["layout.manual.#{name} has #{bad} invalid #{'entry'.pluralize(bad)}"]
  end

  def placement?(entry)
    entry.is_a?(Hash) && Shape.point?(entry) && Shape.size?(entry)
  end

  def edge_placement?(entry)
    entry.is_a?(Hash) && DiagramDocument::SIDES.include?(entry["sourceSide"]) && DiagramDocument::SIDES.include?(entry["targetSide"]) &&
      Shape.list?(entry["points"], EdgeContentRules::MAX_ROUTE_POINTS) &&
      entry["points"].all? { |point| Shape.point?(point) && Shape.identifier?(point["id"]) }
  end
end
