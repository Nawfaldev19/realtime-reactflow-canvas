require "test_helper"

class VersionCopyTest < ActiveSupport::TestCase
  setup do
    counter = 0
    @new_id = -> { "new-#{counter += 1}" }
    group = node_hash("group", kind: "group", number: 1)
    inner = node_hash("inner", kind: "group", parent: "group", number: 2)
    child = node_hash("child", parent: "inner", number: 3)
    loose = node_hash("loose", number: 4)
    @document = document_with(nodes: [group, inner, child, loose], edges: [edge_hash("edge", "child", "loose")])
  end

  def copy(document = @document) = VersionCopy.call(document, new_id: @new_id)

  def by_key(document) = document["nodes"].index_by { |node| node["key"] }

  test "every step and connector gets a fresh id while stable keys stay the same" do
    result = copy

    assert_empty result.log
    assert_empty result.document["nodes"].pluck("id") & @document["nodes"].pluck("id")
    assert_equal @document["nodes"].pluck("key"), result.document["nodes"].pluck("key")
    assert_equal ["edge"], result.document["edges"].pluck("key")
    assert_not_equal "edge", result.document["edges"].first["id"]
  end

  test "group parents are remapped to the copied groups at every depth" do
    nodes = by_key(copy.document)

    assert_nil nodes["group"]["parentId"]
    assert_equal nodes["group"]["id"], nodes["inner"]["parentId"]
    assert_equal nodes["inner"]["id"], nodes["child"]["parentId"]
    assert_empty DiagramDocument.validate(copy.document)
  end

  test "connector ends follow the copied steps" do
    result = copy
    nodes = by_key(result.document)
    edge = result.document["edges"].first

    assert_equal [nodes["child"]["id"], nodes["loose"]["id"]], [edge["source"], edge["target"]]
  end

  test "the saved manual arrangement is re-keyed to the new ids" do
    layout = { "engine" => "dagre", "direction" => "TB",
               "manual" => { "nodes" => { "loose" => { "x" => 1, "y" => 2, "width" => 100, "height" => 50 } },
                             "edges" => { "edge" => { "sourceSide" => nil, "targetSide" => nil, "points" => [] } } } }
    result = copy(@document.merge("layout" => layout))
    nodes = by_key(result.document)

    assert_equal [nodes["loose"]["id"]], result.document.dig("layout", "manual", "nodes").keys
    assert_equal [result.document["edges"].first["id"]], result.document.dig("layout", "manual", "edges").keys
  end

  test "references that are not in the document are reported and never left dangling" do
    broken = @document.merge(
      "nodes" => @document["nodes"] + [node_hash("orphan", parent: "gone", number: 5)],
      "edges" => @document["edges"] + [edge_hash("stray", "loose", "gone")],
      "layout" => { "engine" => "dagre", "direction" => "TB", "manual" => { "nodes" => { "gone" => {} }, "edges" => { "lost" => {} } } }
    )
    result = copy(broken)

    assert_nil by_key(result.document)["orphan"]["parentId"]
    assert_equal ["edge"], result.document["edges"].pluck("key")
    assert_equal({ "nodes" => {}, "edges" => {} }, result.document.dig("layout", "manual"))
    assert_equal 4, result.log.size
    assert_match(/Step 5 lost its group gone/, result.log.first)
  end

  test "a document without nodes, edges or a manual arrangement copies cleanly" do
    result = VersionCopy.call({ "schemaVersion" => 1, "nextNumber" => 1, "layout" => { "engine" => "dagre", "direction" => "LR" } })

    copied = result.document

    assert_equal [[], [], { "nodes" => {}, "edges" => {} }], [copied["nodes"], copied["edges"], copied.dig("layout", "manual")]
    assert_match(/\A\h{8}-/, VersionCopy.call(@document).document["nodes"].first["id"])
  end
end
