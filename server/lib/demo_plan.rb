# Lays out a fictional build plan as a top-to-bottom diagram for the seeds:
# a start node, steps, a yes/no decision with a rework loop, a group of
# sub-steps, more steps, an end node, and sticky notes beside chosen nodes.
class DemoPlan
  COLUMN_CENTER = 90
  ROW = 110
  GROUP_ROW = 84
  NOTE_X = -320
  NOTE_STYLE = { "fill" => "#fde68a" }.freeze
  # The rework loop is drawn as a dashed connector with marching ants.
  REWORK_STYLE = { "pattern" => "dashed", "animated" => true }.freeze

  def self.build(seed:, title:, before:, decision:, rework:, group:, after:, notes: {})
    new(seed).build(title, before:, decision:, rework:, group:, after:, notes:)
  end

  def initialize(seed)
    @builder = DocumentBuilder.new(seed: seed)
    @y = 0
    @anchors = {}
    @steps = 0
  end

  def build(title, before:, decision:, rework:, group:, after:, notes:)
    last = chain(place("start-end", title, :start), before)
    question = place("decision", decision, :decision)
    @builder.edge(last, question)
    fix = @builder.node("step", rework, x: COLUMN_CENTER + 200, y: @anchors[:decision] + 18)
    @builder.edge(question, fix, label: "No")
    @builder.edge(fix, last, label: "Try again", style: REWORK_STYLE)
    container = place_group(*group)
    @builder.edge(question, container, label: "Yes")
    @builder.edge(chain(container, after), place("start-end", "Done", :end))
    notes.each { |anchor, text| note(anchor, text) }
    @builder.to_h
  end

  private

  def chain(from, texts)
    texts.reduce(from) do |previous, text|
      @steps += 1
      current = place("step", text, :"step#{@steps}")
      @builder.edge(previous, current)
      current
    end
  end

  def place(kind, text, anchor)
    width, height = DocumentBuilder::SIZES.fetch(kind)
    @anchors[anchor] = @y
    id = @builder.node(kind, text, x: COLUMN_CENTER - (width / 2), y: @y)
    @y += height + ROW - 64
    id
  end

  def place_group(title, children)
    width = 260
    height = 56 + (children.size * GROUP_ROW)
    @anchors[:group] = @y
    group = @builder.node("group", title, x: COLUMN_CENTER - (width / 2), y: @y, size: [width, height])
    children.each_with_index.reduce(nil) do |previous, (text, index)|
      child = @builder.node("step", text, x: 40, y: 48 + (index * GROUP_ROW), parent: group)
      @builder.edge(previous, child) if previous
      child
    end
    @y += height + ROW - 64
    group
  end

  def note(anchor, text)
    @builder.node("note", text, x: NOTE_X, y: @anchors.fetch(anchor), style: NOTE_STYLE)
  end
end
