# Builds version-1 diagram documents from Ruby, for the starter diagram and the
# seeds. With a `seed` the ids are deterministic UUIDs (v5), so seeded diagrams
# keep the same node ids on every reseed; without one they are random.
class DocumentBuilder
  ID_NAMESPACE = "6f1c2b9e-3d4a-4f5b-8c7d-9e0f1a2b3c4d".freeze
  SIZES = {
    "step" => [180, 64], "decision" => [150, 100], "start-end" => [180, 56],
    "note" => [200, 110], "label" => [160, 40], "group" => [260, 200]
  }.freeze

  def initialize(seed: nil)
    @seed = seed
    @nodes = []
    @edges = []
    @counter = 0
  end

  def node(kind, text, x:, y:, parent: nil, size: SIZES.fetch(kind), style: {})
    width, height = size
    id = next_id
    @nodes << {
      "id" => id, "key" => id, "kind" => kind, "number" => @nodes.size + 1,
      "position" => { "x" => x, "y" => y }, "size" => { "width" => width, "height" => height },
      "parentId" => parent, "z" => @nodes.size + 1, "style" => style, "data" => { "text" => text }
    }
    id
  end

  # A connector with automatic sides and route; a label without a stored
  # position is placed automatically (on the longest middle segment of a step route).
  def edge(source, target, label: nil, route: "step", kind: "connector", style: {})
    id = next_id
    @edges << {
      "id" => id, "key" => id, "kind" => kind, "source" => source, "target" => target,
      "sourceSide" => nil, "targetSide" => nil, "route" => { "style" => route, "points" => [] },
      "label" => label && { "text" => label }, "style" => style
    }
    id
  end

  def to_h
    { "schemaVersion" => DiagramDocument::SCHEMA_VERSION, "nodes" => @nodes, "edges" => @edges, "nextNumber" => @nodes.size + 1 }
  end

  # The three-node diagram every new diagram starts with.
  def self.starter(title)
    builder = new
    start = builder.node("start-end", title, x: 0, y: 0)
    first = builder.node("step", "First step", x: 0, y: 120)
    second = builder.node("step", "Second step", x: 0, y: 240)
    builder.edge(start, first)
    builder.edge(first, second)
    builder.to_h
  end

  private

  def next_id
    @counter += 1
    @seed ? Digest::UUID.uuid_v5(ID_NAMESPACE, "#{@seed}/#{@counter}") : SecureRandom.uuid
  end
end
