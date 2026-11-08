# Checks the optional keys a connector keeps in `style`, `label` and
# `route.points` (stroke and markers, label formatting and position, point
# flags). Keys are optional, so older documents stay valid, but a key that is
# present must hold a value the client can render. The client reads the same
# keys in client/src/document/connectorData.ts.
module EdgeContentRules
  MARKERS = %w[none open closed].freeze
  PATTERNS = %w[solid dotted dashed].freeze
  LAYERS = %w[back normal front].freeze
  ALIGNMENTS = %w[left center right].freeze
  MAX_LABEL_TEXT = 500
  MAX_ROUTE_POINTS = 200

  Values = NodeContentRules::Values
  COLOR = NodeContentRules::COLOR
  FLAG = Values.one_of?([true, false])

  STYLE_RULES = {
    "stroke" => COLOR,
    "width" => ->(value) { Values.between?(value, 0, 10) },
    "pattern" => Values.one_of?(PATTERNS),
    "animated" => FLAG,
    "startMarker" => Values.one_of?(MARKERS),
    "endMarker" => Values.one_of?(MARKERS),
    "startMarkerColor" => COLOR,
    "endMarkerColor" => COLOR,
    "markerSize" => ->(value) { Values.between?(value, 10, 30) },
    "layer" => Values.one_of?(LAYERS)
  }.freeze

  LABEL_RULES = {
    "t" => ->(value) { Values.between?(value, 0, 1) },
    "fontSize" => ->(value) { Values.between?(value, 10, 40) },
    "bold" => FLAG,
    "italic" => FLAG,
    "underline" => FLAG,
    "align" => Values.one_of?(ALIGNMENTS),
    "color" => COLOR,
    "background" => COLOR,
    "maxWidth" => ->(value) { Values.between?(value, 100, 500) },
    "padding" => ->(value) { Values.between?(value, 0, 20) },
    "border" => FLAG,
    "borderWidth" => ->(value) { Values.between?(value, 1, 5) },
    "borderColor" => COLOR
  }.freeze

  POINT_RULES = {
    "userCreated" => FLAG,
    "axis" => Values.one_of?(%w[x y])
  }.freeze

  module_function

  # Problems with an edge's style, label and route points, as phrases ("has an invalid label.fontSize").
  def errors(edge)
    style_errors(edge["style"]) + label_errors(edge["label"]) + point_errors(edge["route"])
  end

  def style_errors(style)
    style.is_a?(Hash) ? NodeContentRules.check(style, STYLE_RULES, "style") : []
  end

  def label_errors(label)
    return [] if label.nil?
    return ["has an invalid label"] unless label.is_a?(Hash) && label["text"].is_a?(String)
    return ["has an invalid label.text"] if label["text"].size > MAX_LABEL_TEXT

    NodeContentRules.check(label, LABEL_RULES, "label")
  end

  def point_errors(route)
    points = route.is_a?(Hash) ? route["points"] : nil
    return [] unless points.is_a?(Array)
    return ["has more than #{MAX_ROUTE_POINTS} route points"] if points.size > MAX_ROUTE_POINTS

    points.grep(Hash).flat_map { |point| NodeContentRules.check(point, POINT_RULES, "route point") }.uniq
  end
end
