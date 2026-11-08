require "test_helper"

class VersionContentTest < ActiveSupport::TestCase
  setup do
    @document = document_with(nodes: [node_hash("a"), node_hash("b", number: 2)], edges: [edge_hash("e", "a", "b")])
  end

  test "a document is the same as itself and as a copy with its lists and keys reordered" do
    reordered = @document.merge("nodes" => @document["nodes"].reverse.map { |node| node.to_a.reverse.to_h })

    assert VersionContent.same?(@document, @document.deep_dup)
    assert VersionContent.same?(@document, reordered)
  end

  test "the node counter and whole and decimal numbers do not count as changes" do
    bumped = @document.merge("nextNumber" => 40)
    decimal = @document.deep_dup.tap { |doc| doc["nodes"][0]["position"] = { "x" => 0.0, "y" => 0.0 } }

    assert VersionContent.same?(@document, bumped)
    assert VersionContent.same?(@document, decimal)
  end

  test "any change to a node, an edge or the layout counts" do
    moved = @document.deep_dup.tap { |doc| doc["nodes"][0]["position"]["x"] = 1 }
    restyled = @document.deep_dup.tap { |doc| doc["edges"][0]["style"] = { "stroke" => "#ff0000" } }
    laid_out = @document.merge("layout" => { "engine" => "dagre", "direction" => "TB", "manual" => { "nodes" => {}, "edges" => {} } })
    fewer = @document.merge("nodes" => @document["nodes"].first(1), "edges" => [])

    [moved, restyled, laid_out, fewer].each { |changed| assert_not VersionContent.same?(@document, changed) }
  end

  test "a missing layout equals a null one, and malformed input compares as empty" do
    assert VersionContent.same?(@document, @document.merge("layout" => nil))
    assert VersionContent.same?(nil, { "nodes" => ["not a node"] })
    assert_not VersionContent.same?(nil, @document)
  end
end
