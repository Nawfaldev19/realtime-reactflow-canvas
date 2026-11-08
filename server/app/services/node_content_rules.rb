# Checks the kind-specific keys a node keeps in `style` and `data` (shape
# outlines, line rotation and length, sketch samples, text formatting). Keys
# are optional, so older documents stay valid, but a key that is present must
# hold a value the client can render. The client reads the same keys in
# client/src/document/nodeData.ts.
module NodeContentRules
  SHAPE_KINDS = %w[diamond hexagon circle triangle parallelogram cylinder].freeze
  BORDER_STYLES = %w[solid dashed dotted].freeze
  MAX_TEXT = 20_000
  MAX_LINE_LENGTH = 5000
  # x, y and pressure per sample.
  MAX_SKETCH_NUMBERS = 3 * 4000

  module Values
    HEX = /\A#(?:\h{3}|\h{4}|\h{6}|\h{8})\z/
    FUNCTIONAL = /\A(rgba?)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+|1\.0+)\s*)?\)\z/i

    module_function

    def finite?(value) = value.is_a?(Numeric) && value.to_f.finite?
    def between?(value, min, max) = finite?(value) && value >= min && value <= max
    def one_of?(options) = ->(value) { options.include?(value) }

    # Hex (3, 4, 6 or 8 digits), rgb() or rgba(), the same forms the client accepts.
    def color?(value)
      return false unless value.is_a?(String)
      return true if value.match?(HEX)

      match = FUNCTIONAL.match(value)
      return false unless match

      match[2..4].all? { |channel| channel.to_i <= 255 } && (match[1].casecmp?("rgba") == !match[5].nil?)
    end

    def sketch_points?(value)
      value.is_a?(Array) && value.size <= MAX_SKETCH_NUMBERS && (value.size % 3).zero? && value.all? { |number| finite?(number) }
    end
  end

  COLOR = ->(value) { Values.color?(value) }

  STYLE_RULES = {
    "fill" => COLOR,
    "stroke" => COLOR,
    "color" => COLOR,
    "borderWidth" => ->(value) { Values.between?(value, 0, 20) },
    "borderStyle" => Values.one_of?(BORDER_STYLES),
    "fontWeight" => Values.one_of?(%w[normal bold]),
    "fontStyle" => Values.one_of?(%w[normal italic]),
    "textAlign" => Values.one_of?(%w[left center right]),
    "fontSize" => ->(value) { Values.between?(value, 8, 96) },
    "opacity" => ->(value) { Values.between?(value, 0, 1) },
    "keepAspectRatio" => Values.one_of?([true, false])
  }.freeze

  TEXT_RULES = { "text" => ->(value) { value.is_a?(String) && value.size <= MAX_TEXT } }.freeze

  DATA_RULES = {
    "shape" => { "shape" => Values.one_of?(SHAPE_KINDS) },
    "line" => {
      "rotation" => ->(value) { Values.finite?(value) && value >= 0 && value < 360 },
      "length" => ->(value) { Values.between?(value, 1, MAX_LINE_LENGTH) },
      "thickness" => ->(value) { Values.between?(value, 1, 20) },
      "lineStyle" => Values.one_of?(BORDER_STYLES),
      "color" => COLOR
    },
    "sketch" => {
      "points" => ->(value) { Values.sketch_points?(value) },
      "initialSize" => ->(value) { DiagramDocument::Shape.size?(value) },
      "strokeSize" => ->(value) { Values.between?(value, 1, 40) },
      "color" => COLOR
    }
  }.freeze

  module_function

  # Problems with a node's style and data, as phrases ("has an invalid data.rotation").
  def errors(node)
    style = node["style"].is_a?(Hash) ? check(node["style"], STYLE_RULES, "style") : []
    data = node["data"].is_a?(Hash) ? check(node["data"], TEXT_RULES.merge(DATA_RULES.fetch(node["kind"], {})), "data") : []
    style + data
  end

  def check(values, rules, scope)
    rules.filter_map { |key, rule| "has an invalid #{scope}.#{key}" if values.key?(key) && !rule.call(values[key]) }
  end
end
