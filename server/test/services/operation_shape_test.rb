require "test_helper"

class OperationShapeTest < ActiveSupport::TestCase
  delegate :errors, to: :OperationShape

  test "well-formed operations of every type pass" do
    [
      { "type" => "node.add", "node" => node_hash("a") },
      { "type" => "node.update", "id" => "a", "fields" => { "position" => { "x" => 1, "y" => 2 }, "data" => { "text" => nil } } },
      { "type" => "node.remove", "id" => "a" },
      { "type" => "edge.add", "edge" => edge_hash("e", "a", "b") },
      { "type" => "edge.update", "id" => "e", "fields" => { "label" => nil } },
      { "type" => "edge.remove", "id" => "e" },
      { "type" => "layout.set", "layout" => nil },
      { "type" => "batch", "ops" => [{ "type" => "node.remove", "id" => "a" }] }
    ].each { |operation| assert_empty errors(operation), operation["type"] }
  end

  test "unknown types and non-objects are rejected" do
    assert_equal ["must be an object with a known type"], errors({ "type" => "node.explode" })
    assert_equal ["must be an object with a known type"], errors("node.add")
    assert_equal ["must be an object with a known type"], errors({ "type" => "batch", "ops" => [42] })
  end

  test "ids must be identifiers" do
    assert_equal ["node.remove needs an id"], errors({ "type" => "node.remove", "id" => "a b" })
    assert_equal ["node.add needs an object with an id"], errors({ "type" => "node.add", "node" => { "id" => 3 } })
    assert_equal ["edge.update needs an id"], errors({ "type" => "edge.update", "fields" => {} })
  end

  test "updates accept only their entity's fields" do
    assert_equal ["node.update has unknown fields"], errors({ "type" => "node.update", "id" => "a", "fields" => { "id" => "b" } })
    assert_equal ["edge.update has unknown fields"], errors({ "type" => "edge.update", "id" => "e", "fields" => { "data" => {} } })
    assert_equal ["node.update needs a fields object"], errors({ "type" => "node.update", "id" => "a", "fields" => [] })
    assert_equal ["node.update needs a data object"], errors({ "type" => "node.update", "id" => "a", "fields" => { "data" => "text" } })
  end

  test "layout.set needs a layout key holding an object or null" do
    assert_equal ["layout.set needs a layout object or null"], errors({ "type" => "layout.set" })
    assert_equal ["layout.set needs a layout object or null"], errors({ "type" => "layout.set", "layout" => "dagre" })
  end

  test "batches need a list, bounded depth and a bounded number of changes" do
    assert_equal ["batch needs a list of operations"], errors({ "type" => "batch", "ops" => {} })
    deep = (1..9).reduce({ "type" => "node.remove", "id" => "a" }) { |inner, _| { "type" => "batch", "ops" => [inner] } }

    assert_equal ["batch is nested too deeply"], errors(deep)
    wide = { "type" => "batch", "ops" => Array.new(OperationShape::MAX_LEAVES + 1) { { "type" => "edge.remove", "id" => "e" } } }

    assert_equal ["has more than #{OperationShape::MAX_LEAVES} changes"], errors(wide)
  end

  test "an added node or edge needs every field of the client's model and nothing else" do
    assert_equal ["node.add is missing z"], errors({ "type" => "node.add", "node" => node_hash("a").except("z") })
    assert_equal ["node.add has unknown fields"], errors({ "type" => "node.add", "node" => node_hash("a").merge("extra" => 1) })
    assert_equal ["edge.add is missing route, label"],
                 errors({ "type" => "edge.add", "edge" => edge_hash("e", "a", "b").except("route", "label") })
  end

  test "every node field must have its type" do
    {
      "z" => [[], 1.5, "1"], "number" => [0, 1.5, "2"], "position" => [{ "x" => "1", "y" => 0 }, [1, 2]],
      "size" => [{ "width" => -1, "height" => 5 }, { "width" => 3000, "height" => 5 }], "kind" => %w[spaceship],
      "key" => ["a b", 7], "parentId" => [3, "a b"], "style" => [[]], "data" => ["text"]
    }.each do |field, values|
      values.each do |value|
        message = field == "data" ? "needs a data object" : "has an invalid #{field}"

        assert_equal ["node.add #{message}"], errors({ "type" => "node.add", "node" => node_hash("a").merge(field => value) }),
                     "#{field}=#{value.inspect}"
        assert_equal ["node.update #{message}"], errors({ "type" => "node.update", "id" => "a", "fields" => { field => value } }),
                     "#{field}=#{value.inspect}"
      end
    end
  end

  test "every edge field must have its type" do
    {
      "source" => [nil, 3], "target" => ["a b"], "kind" => %w[curve], "sourceSide" => %w[up], "targetSide" => [1],
      "route" => ["step", { "style" => "zigzag", "points" => [] }, { "style" => "step", "points" => [{ "x" => 1 }] }],
      "label" => ["hello"], "style" => [nil]
    }.each do |field, values|
      values.each do |value|
        edge = edge_hash("e", "a", "b").merge(field => value)

        assert_equal ["edge.add has an invalid #{field}"], errors({ "type" => "edge.add", "edge" => edge }), "#{field}=#{value.inspect}"
        assert_equal ["edge.update has an invalid #{field}"],
                     errors({ "type" => "edge.update", "id" => "e", "fields" => { field => value } })
      end
    end
  end

  test "an added node or edge must carry content the client can render" do
    assert_equal ["node.add has an invalid style.fill"],
                 errors({ "type" => "node.add", "node" => node_hash("a").merge("style" => { "fill" => "red" }) })
    edge = edge_hash("e", "a", "b").merge("label" => { "text" => 7 })

    assert_equal ["edge.add has an invalid label"], errors({ "type" => "edge.add", "edge" => edge })
  end

  test "strings anywhere in an operation are bounded" do
    long = "w" * (OperationShape::MAX_STRING + 1)

    assert_equal ["has a text longer than #{OperationShape::MAX_STRING} characters"],
                 errors({ "type" => "node.update", "id" => "a", "fields" => { "style" => { "note" => [long] } } })
    assert_equal ["has a text longer than #{OperationShape::MAX_STRING} characters"],
                 errors({ "type" => "batch", "ops" => [{ "type" => "node.update", "id" => "a", "fields" => { "data" => { long => 1 } } }] })
    assert_empty errors({ "type" => "node.update", "id" => "a", "fields" => { "data" => { "text" => "w" * OperationShape::MAX_STRING } } })
  end
end
