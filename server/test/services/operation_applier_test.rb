require "test_helper"

# The shared cases are also run by the client (client/src/collab/sharedCases.test.ts),
# so both sides apply operations by the same rules.
class OperationApplierTest < ActiveSupport::TestCase
  CASES = JSON.parse(Rails.root.join("test/fixtures/files/operation_cases.json").read).fetch("cases")

  CASES.each do |example|
    test "shared case: #{example['name']}" do
      result = OperationApplier.apply(example["document"], example["operation"])

      assert_equal example["expected"], result.document
      assert_equal example["skipped"], result.skipped
      assert_equal example["expected"] != example["document"], result.changed
    end
  end

  test "the input document is never modified" do
    example = CASES.find { |entry| entry["name"].start_with?("node.remove removes") }
    document = example["document"].deep_dup
    OperationApplier.apply(document, example["operation"])

    assert_equal example["document"], document
  end

  test "a missing node list counts as empty" do
    result = OperationApplier.apply({ "schemaVersion" => 1, "nextNumber" => 1 }, { "type" => "node.add", "node" => node_hash("n") })

    assert_equal ["n"], result.document["nodes"].pluck("id")
    assert_equal 2, result.document["nextNumber"]
  end

  test "a node number that is not a number leaves nextNumber alone (the validator rejects the document)" do
    result = OperationApplier.apply(document_with, { "type" => "node.add", "node" => node_hash("n").merge("number" => "seven") })

    assert_equal 1, result.document["nextNumber"]
  end

  test "children of a removed nested group go with it" do
    nodes = [node_hash("g", kind: "group", number: 1), node_hash("h", kind: "group", parent: "g", number: 2),
             node_hash("x", parent: "h", number: 3)]
    result = OperationApplier.apply(document_with(nodes: nodes), { "type" => "node.remove", "id" => "g" })

    assert_empty result.document["nodes"]
  end
end
