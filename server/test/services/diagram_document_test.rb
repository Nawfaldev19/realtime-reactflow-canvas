require "test_helper"

class DiagramDocumentTest < ActiveSupport::TestCase
  delegate :validate, to: :DiagramDocument

  test "accepts the empty document and the starter document" do
    assert_empty validate(DiagramDocument.empty)
    assert_empty validate(DocumentBuilder.starter("Plan"))
  end

  test "rejects non-objects, oversized documents and unknown schema versions" do
    assert_equal ["must be an object"], validate([])
    huge = document_with(nodes: [node_hash("a").merge("data" => { "text" => "x" * DiagramDocument::MAX_BYTES })])

    assert_match(/larger than/, validate(huge).first)
    assert_includes validate(DiagramDocument.empty.merge("schemaVersion" => 2)), "has an unsupported schemaVersion"
  end

  test "requires node and edge lists and a positive counter" do
    errors = validate({ "schemaVersion" => 1, "nodes" => {}, "edges" => nil, "nextNumber" => 0 })

    assert_equal 3, errors.size
  end

  test "checks every node field" do
    bad = node_hash("a").merge("kind" => "blob", "number" => 0, "position" => { "x" => "1", "y" => 0 },
                               "size" => { "width" => 0, "height" => 10 }, "z" => 1.5, "data" => nil)
    errors = DiagramDocument::Validator.new(document_with(nodes: [bad])).errors

    assert_equal 6, errors.size
    assert(errors.all? { |error| error.start_with?('node "a"') })
  end

  test "rejects ids that are not short identifiers, duplicate ids and non-object entries" do
    errors = validate(document_with(nodes: [node_hash("a b"), node_hash("dup"), node_hash("dup"), "x"]))

    assert_includes errors, 'node "a b" needs a string id and key'
    assert_includes errors, 'node "dup" has a duplicate id'
    assert_includes errors, "every node and edge must be an object"
  end

  test "rejects infinite coordinates" do
    node = node_hash("a").merge("position" => { "x" => Float::INFINITY, "y" => 0 })

    assert_includes validate(document_with(nodes: [node])), 'node "a" needs a numeric position'
  end

  test "parents must be groups in the same document" do
    nodes = [node_hash("g", kind: "group"), node_hash("child", parent: "g", number: 2), node_hash("lost", parent: "missing", number: 3)]

    assert_equal ['node "lost" has a parent that is not a group'], validate(document_with(nodes: nodes))
  end

  test "rejects parent cycles" do
    nodes = [node_hash("a", kind: "group", parent: "b"), node_hash("b", kind: "group", parent: "a", number: 2)]

    assert_equal(2, validate(document_with(nodes: nodes)).count { |error| error.include?("cycle") })
  end

  test "accepts nested groups" do
    nodes = [node_hash("outer", kind: "group"), node_hash("inner", kind: "group", parent: "outer", number: 2),
             node_hash("leaf", parent: "inner", number: 3)]

    assert_empty validate(document_with(nodes: nodes))
  end

  test "edges must connect nodes in the document with a valid route" do
    edge = edge_hash("e", "a", "ghost").merge("sourceSide" => "middle", "route" => { "style" => "zigzag", "points" => [] })
    errors = validate(document_with(nodes: [node_hash("a")], edges: [edge]))

    assert_includes errors, 'edge "e" has an unknown side'
    assert_includes errors, 'edge "e" needs a valid route'
    assert_includes errors, 'edge "e" must connect two nodes in this diagram'
  end

  test "an edge list without nodes is rejected, which guards against wiped documents" do
    assert_includes validate(document_with(edges: [edge_hash("e", "a", "b")])), 'edge "e" must connect two nodes in this diagram'
  end

  test "route points need ids and coordinates" do
    edge = edge_hash("e", "a",
                     "a").merge("route" => { "style" => "polyline", "points" => [{ "id" => "p1", "x" => 1, "y" => 2 }, { "x" => 1 }] })

    assert_includes validate(document_with(nodes: [node_hash("a")], edges: [edge])), 'edge "e" needs a valid route'
  end

  test "reports at most five problems" do
    nodes = Array.new(10) { |index| node_hash("n#{index}").merge("kind" => "nope") }

    assert_equal DiagramDocument::MAX_REPORTED_ERRORS, validate(document_with(nodes: nodes)).size
  end
end
