require "test_helper"

class NodeContentRulesTest < ActiveSupport::TestCase
  def errors_for(kind, data: {}, style: {})
    NodeContentRules.errors(node_hash("n", kind: kind).merge("data" => data, "style" => style))
  end

  test "accepts nodes without the optional keys and with valid ones" do
    assert_empty errors_for("step")
    assert_empty errors_for("line",
                            data: { "rotation" => 359.5, "length" => 160, "thickness" => 4, "lineStyle" => "dotted", "color" => "#336699" })
    assert_empty errors_for("shape", data: { "text" => "", "shape" => "cylinder" })
    assert_empty errors_for("sketch", data: { "points" => [1, 2, 0.5, 3.5, 4, 1], "initialSize" => { "width" => 10, "height" => 8 },
                                              "strokeSize" => 7 })
    style = { "fill" => "rgba(1, 2, 3, 0.5)", "stroke" => "#abc", "borderWidth" => 0, "borderStyle" => "dashed", "fontWeight" => "bold",
              "fontStyle" => "italic", "textAlign" => "right", "fontSize" => 14, "opacity" => 1, "keepAspectRatio" => true }

    assert_empty errors_for("step", style: style)
  end

  test "rejects line rotations outside [0, 360), bad lengths, thickness and styles" do
    errors = errors_for("line", data: { "rotation" => 360, "length" => 0, "thickness" => 21, "lineStyle" => "wavy", "color" => "blue" })

    assert_equal ["has an invalid data.rotation", "has an invalid data.length", "has an invalid data.thickness",
                  "has an invalid data.lineStyle", "has an invalid data.color"], errors
    assert_equal ["has an invalid data.rotation"], errors_for("line", data: { "rotation" => -1 })
  end

  test "rejects unknown shapes and over-long text" do
    assert_equal ["has an invalid data.shape"], errors_for("shape", data: { "shape" => "octagon" })
    assert_equal ["has an invalid data.text"], errors_for("step", data: { "text" => "x" * (NodeContentRules::MAX_TEXT + 1) })
    assert_equal ["has an invalid data.text"], errors_for("note", data: { "text" => 12 })
  end

  test "sketch samples are flat triples of finite numbers within the cap" do
    assert_equal ["has an invalid data.points"], errors_for("sketch", data: { "points" => [1, 2] })
    assert_equal ["has an invalid data.points"], errors_for("sketch", data: { "points" => [1, "2", 3] })
    assert_equal ["has an invalid data.points"],
                 errors_for("sketch", data: { "points" => [0] * (NodeContentRules::MAX_SKETCH_NUMBERS + 3) })
    assert_equal ["has an invalid data.initialSize", "has an invalid data.strokeSize"],
                 errors_for("sketch", data: { "initialSize" => { "width" => 0, "height" => 1 }, "strokeSize" => 0.5 })
  end

  test "colours must be hex, rgb() or rgba() with channels up to 255" do
    rules = NodeContentRules::Values

    valid = ["#fff", "#ffff", "#a1b2c3", "#a1b2c3d4", "rgb(1, 2, 3)", "RGBA(0,0,0,1)", "rgba(9, 9, 9, .25)"]

    assert(valid.all? { |color| rules.color?(color) })
    ["red", "#12", "rgb(300, 0, 0)", "rgba(1, 2, 3)", "rgb(1, 2, 3, 0.5)", nil, 5].each do |color|
      assert_not rules.color?(color), color.inspect
    end
  end

  test "style values are checked when present" do
    style = { "fill" => "nope", "borderWidth" => 30, "fontSize" => 4, "opacity" => 2, "keepAspectRatio" => "yes", "textAlign" => "justify" }
    errors = errors_for("step", style: style)

    assert_equal 6, errors.size
    assert(errors.all? { |error| error.start_with?("has an invalid style.") })
  end

  test "ignores style and data that are not objects (reported by the document rules)" do
    assert_empty NodeContentRules.errors(node_hash("n").merge("style" => nil, "data" => []))
  end

  test "the document validator reports content problems and oversized nodes per node" do
    line = node_hash("l", kind: "line").merge("data" => { "rotation" => 400 }, "size" => { "width" => 2600, "height" => 20 })
    errors = DiagramDocument.validate(document_with(nodes: [line]))

    assert_includes errors, 'node "l" has an invalid data.rotation'
    assert_includes errors, 'node "l" is larger than 2500 on a side'
  end
end
