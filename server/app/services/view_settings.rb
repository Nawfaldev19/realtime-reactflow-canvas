# How a diagram opens and looks, and the editors' snapping settings. Stored next
# to the document, not inside it, so changing the opening view never conflicts
# with an edit to the nodes. `snapping` is optional (older rows predate it);
# readers fall back to the defaults.
module ViewSettings
  OPENING_MODES = %w[fitWidth fitAll custom saved].freeze
  BACKGROUND_PATTERNS = %w[dots lines cross none].freeze
  CUSTOM_PERCENT_RANGE = (10..200)
  GAP_RANGE = (4..200)
  NEAREST_RANGE = (1..10)
  ZOOM_RANGE = (0.1..2)
  # Saved viewport offsets are screen pixels; anything beyond this is not a real view.
  MAX_OFFSET = 1_000_000
  KEYS = %w[openingView background animateOnOpen snapping].freeze

  module_function

  def defaults
    {
      "openingView" => { "mode" => "fitWidth", "customPercent" => 70, "savedViewport" => nil },
      "background" => { "pattern" => "dots", "gap" => 20 },
      "animateOnOpen" => false,
      "snapping" => { "enabled" => true, "nearest" => 2 }
    }
  end

  def validate(settings)
    return ["must be an object"] unless settings.is_a?(Hash)

    [*unknown_key_errors(settings), *opening_view_errors(settings["openingView"]), *background_errors(settings["background"]),
     *(["animateOnOpen must be true or false"] unless boolean?(settings["animateOnOpen"])),
     *snapping_errors(settings["snapping"])]
  end

  def unknown_key_errors(settings)
    unknown = settings.keys - KEYS
    unknown.empty? ? [] : ["unknown keys: #{unknown.join(', ')}"]
  end

  def opening_view_errors(view)
    return ["openingView must be an object"] unless view.is_a?(Hash)

    problems = []
    problems << "openingView.mode is not supported" unless OPENING_MODES.include?(view["mode"])
    problems << "openingView.customPercent must be 10 to 200" unless CUSTOM_PERCENT_RANGE.cover?(view["customPercent"])
    problems << "openingView.savedViewport must have x, y and a zoom of 0.1 to 2" unless viewport?(view["savedViewport"])
    problems << "openingView.savedViewport is required for a saved view" if view["mode"] == "saved" && view["savedViewport"].nil?
    problems
  end

  def background_errors(background)
    return ["background must be an object"] unless background.is_a?(Hash)

    problems = []
    problems << "background.pattern is not supported" unless BACKGROUND_PATTERNS.include?(background["pattern"])
    problems << "background.gap must be 4 to 200" unless GAP_RANGE.cover?(background["gap"])
    problems
  end

  def snapping_errors(snapping)
    return [] if snapping.nil?
    return ["snapping must be an object"] unless snapping.is_a?(Hash)

    problems = []
    problems << "snapping.enabled must be true or false" unless boolean?(snapping["enabled"])
    unless snapping["nearest"].is_a?(Integer) && NEAREST_RANGE.cover?(snapping["nearest"])
      problems << "snapping.nearest must be a whole number from 1 to 10"
    end
    problems
  end

  def viewport?(viewport)
    return true if viewport.nil?
    return false unless viewport.is_a?(Hash) && %w[x y zoom].all? { |key| finite?(viewport[key]) }

    ZOOM_RANGE.cover?(viewport["zoom"]) && viewport["x"].abs <= MAX_OFFSET && viewport["y"].abs <= MAX_OFFSET
  end

  def finite?(value)
    value.is_a?(Numeric) && value.to_f.finite?
  end

  def boolean?(value)
    [true, false].include?(value)
  end
end
