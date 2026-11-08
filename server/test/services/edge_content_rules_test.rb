require "test_helper"

class EdgeContentRulesTest < ActiveSupport::TestCase
  def errors_for(style: {}, label: nil, points: [])
    EdgeContentRules.errors(edge_hash("e", "a", "b").merge("style" => style, "label" => label,
                                                           "route" => { "style" => "step", "points" => points }))
  end

  test "accepts connectors without the optional keys and with valid ones" do
    assert_empty errors_for
    style = { "stroke" => "#336699", "width" => 0, "pattern" => "dashed", "animated" => true, "startMarker" => "open",
              "endMarker" => "none", "startMarkerColor" => "#abc", "endMarkerColor" => "rgb(1, 2, 3)", "markerSize" => 30,
              "layer" => "back" }
    label = { "text" => "Yes", "t" => 0.385, "fontSize" => 40, "bold" => true, "italic" => false, "underline" => true,
              "align" => "right", "color" => "#000", "background" => "#fff", "maxWidth" => 100, "padding" => 0,
              "border" => true, "borderWidth" => 5, "borderColor" => "#123456" }

    assert_empty errors_for(style: style)
    assert_empty errors_for(label: label)
    points = [{ "id" => "p1", "x" => 1, "y" => 2, "userCreated" => true, "axis" => "x" }, { "id" => "p2", "x" => 3, "y" => 4 }]

    assert_empty errors_for(points: points)
  end

  test "rejects style values outside their ranges and options" do
    errors = errors_for(style: { "stroke" => "blue", "width" => 11, "pattern" => "wavy", "animated" => "yes", "startMarker" => "dot",
                                 "markerSize" => 9, "layer" => "top" })

    assert_equal %w[stroke width pattern animated startMarker markerSize layer].map { |key| "has an invalid style.#{key}" }, errors
  end

  test "rejects label positions outside [0, 1], bad formatting and over-long text" do
    label = { "text" => "x", "t" => 1.5, "fontSize" => 9, "maxWidth" => 600, "padding" => -1, "borderWidth" => 0, "align" => "justify" }
    errors = errors_for(label: label)

    assert_equal ["has an invalid label.t", "has an invalid label.fontSize", "has an invalid label.align", "has an invalid label.maxWidth",
                  "has an invalid label.padding", "has an invalid label.borderWidth"], errors
    assert_equal ["has an invalid label.text"], errors_for(label: { "text" => "x" * (EdgeContentRules::MAX_LABEL_TEXT + 1) })
    assert_equal ["has an invalid label"], errors_for(label: { "text" => 3 })
    assert_equal ["has an invalid label"], errors_for(label: "Yes")
  end

  test "checks route point flags and caps the number of points" do
    assert_equal ["has an invalid route point.userCreated", "has an invalid route point.axis"],
                 errors_for(points: [{ "id" => "p", "x" => 0, "y" => 0, "userCreated" => "yes", "axis" => "z" }])
    too_many = Array.new(EdgeContentRules::MAX_ROUTE_POINTS + 1) { |index| { "id" => "p#{index}", "x" => index, "y" => 0 } }

    assert_equal ["has more than 200 route points"], errors_for(points: too_many)
  end

  test "ignores a style or route that is not an object (reported by the document rules)" do
    assert_empty EdgeContentRules.errors(edge_hash("e", "a", "b").merge("style" => nil, "route" => nil))
  end

  test "the document validator reports connector problems per edge" do
    edge = edge_hash("e", "a", "b").merge("style" => { "width" => 99 }, "label" => { "text" => "Yes", "t" => -1 })
    errors = DiagramDocument.validate(document_with(nodes: [node_hash("a"), node_hash("b", number: 2)], edges: [edge]))

    assert_includes errors, 'edge "e" has an invalid style.width'
    assert_includes errors, 'edge "e" has an invalid label.t'
  end

  test "the seeded plans and the starter document pass the connector rules" do
    assert_empty DiagramDocument.validate(DocumentBuilder.starter("Plan"))
    plan = DemoPlan.build(seed: "check", title: "Plan", before: ["Measure"], decision: "Fits?", rework: "Trim",
                          group: ["Glue", %w[Clamp Wait]], after: ["Finish"])

    assert_empty DiagramDocument.validate(plan)
    rework = plan["edges"].find { |edge| edge.dig("label", "text") == "Try again" }

    assert_equal({ "pattern" => "dashed", "animated" => true }, rework["style"])
  end
end
