require "test_helper"

class DocumentBuilderTest < ActiveSupport::TestCase
  test "the starter diagram is a titled start node and two linked steps" do
    document = DocumentBuilder.starter("Build a stool")

    assert_equal(%w[start-end step step], document["nodes"].pluck("kind"))
    assert_equal "Build a stool", document["nodes"].first.dig("data", "text")
    assert_equal 2, document["edges"].size
    assert_equal 4, document["nextNumber"]
  end

  test "a seed makes ids deterministic, and keys start equal to ids" do
    first = DocumentBuilder.new(seed: "plan").tap { |builder| builder.node("step", "A", x: 0, y: 0) }.to_h
    second = DocumentBuilder.new(seed: "plan").tap { |builder| builder.node("step", "A", x: 0, y: 0) }.to_h
    node = first["nodes"].first

    assert_equal node["id"], second["nodes"].first["id"]
    assert_equal node["id"], node["key"]
    assert_not_equal DocumentBuilder.starter("x")["nodes"].first["id"], DocumentBuilder.starter("x")["nodes"].first["id"]
  end

  test "every seeded demo plan is a valid document with a group, a decision and notes" do
    document = DemoPlan.build(seed: "test", title: "Plan", before: %w[One Two], decision: "Ok?", rework: "Fix",
                              group: ["Group", %w[Inner1 Inner2]], after: ["Three"], notes: { step1: "Note", group: "Group note" })
    kinds = document["nodes"].pluck("kind")

    assert_empty DiagramDocument.validate(document)
    assert_equal 1, kinds.count("group")
    assert_equal 1, kinds.count("decision")
    assert_equal 2, kinds.count("note")
    assert_equal(2, document["nodes"].count { |node| node["parentId"] })
  end
end
