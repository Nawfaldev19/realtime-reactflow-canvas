require "test_helper"

class LayoutRulesTest < ActiveSupport::TestCase
  def layout(manual: { "nodes" => {}, "edges" => {} }, **overrides)
    { "engine" => "dagre", "direction" => "TB", "manual" => manual }.merge(overrides.transform_keys(&:to_s))
  end

  def placement(x: 0, y: 0) = { "x" => x, "y" => y, "width" => 100, "height" => 50 }

  test "manual mode (no layout) and a complete layout are valid" do
    assert_empty LayoutRules.errors(nil)
    manual = { "nodes" => { "a" => placement(x: 10) },
               "edges" => { "e" => { "sourceSide" => "bottom", "targetSide" => nil, "points" => [{ "id" => "p1", "x" => 1, "y" => 2 }] } } }

    assert_empty LayoutRules.errors(layout(manual: manual, engine: "layered", direction: "LR"))
  end

  test "rejects unknown engines, directions and shapes" do
    assert_equal ["layout must be an object"], LayoutRules.errors([])
    errors = LayoutRules.errors(layout(engine: "force", direction: "BT"))

    assert_includes errors, "layout has an unknown engine"
    assert_includes errors, "layout has an unknown direction"
    assert_includes LayoutRules.errors(layout(manual: nil)), "layout.manual must be an object"
  end

  test "reports invalid snapshot entries" do
    manual = { "nodes" => { "a" => placement, "b" => { "x" => 1 }, "bad id" => placement },
               "edges" => { "e" => { "sourceSide" => "middle", "targetSide" => nil, "points" => [] } } }
    errors = LayoutRules.errors(layout(manual: manual))

    assert_includes errors, "layout.manual.nodes has 2 invalid entries"
    assert_includes errors, "layout.manual.edges has 1 invalid entry"
    listed = LayoutRules.errors(layout(manual: { "nodes" => [], "edges" => {} }))

    assert_includes listed, "layout.manual.nodes must be an object of at most 5000 entries"
  end

  test "the document validator checks the layout" do
    document = document_with(nodes: [node_hash("a")]).merge("layout" => layout(direction: "XY"))

    assert_includes DiagramDocument.validate(document), "layout has an unknown direction"
    assert_empty DiagramDocument.validate(document.merge("layout" => layout))
  end
end
