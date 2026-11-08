require "test_helper"

class OperationSubmitTest < ActiveSupport::TestCase
  setup do
    @workspace = create_workspace
    @editor = add_member(@workspace)
    @diagram = create_diagram(@workspace, document: document_with(nodes: [node_hash("a"), node_hash("b", number: 2)]))
  end

  def submit(operation, member: @editor, session: "s1", client_op_id: "1")
    OperationSubmit.call(diagram_id: @diagram.id, member: member, session_id: session, client_op_id: client_op_id, operation: operation)
  end

  def move(id = "a", x = 40) = { "type" => "node.update", "id" => id, "fields" => { "position" => { "x" => x, "y" => 0 } } }

  test "an accepted operation is applied to the stored document, bumps the revision and is logged under it" do
    outcome = submit(move)

    assert_predicate outcome, :accepted?
    assert_equal 1, @diagram.reload.revision
    assert_equal({ "x" => 40, "y" => 0 }, @diagram.document["nodes"].first["position"])
    assert_equal [1, "s1", "1", move], outcome.entry.slice(:sequence, :session_id, :client_op_id, :operation).values
    assert_equal @editor, @diagram.updated_by
  end

  test "operations are numbered one after another" do
    sequences = Array.new(3) { |index| submit(move("a", index), client_op_id: index.to_s).entry.sequence }

    assert_equal [1, 2, 3], sequences
    assert_equal 3, @diagram.reload.revision
  end

  test "an operation that changes nothing is still ordered, so every client skips it the same way" do
    outcome = submit({ "type" => "node.update", "id" => "gone", "fields" => { "z" => 3 } })

    assert_predicate outcome, :accepted?
    assert_equal 1, @diagram.reload.revision
  end

  test "a re-sent operation is a duplicate and is not applied twice" do
    first = submit({ "type" => "node.remove", "id" => "a" })
    again = submit({ "type" => "node.remove", "id" => "a" })

    assert_predicate again, :duplicate?
    assert_equal first.entry, again.entry
    assert_equal 1, @diagram.reload.revision
  end

  test "the same client operation id from another session is a different operation" do
    submit(move, session: "s1")
    outcome = submit(move("b"), session: "s2")

    assert_predicate outcome, :accepted?
    assert_equal 2, outcome.entry.sequence
  end

  test "the same session and client operation id from another member is a different operation" do
    other = add_member(@workspace)
    submit(move("a", 10), member: other)
    outcome = submit(move("a", 20))

    assert_predicate outcome, :accepted?
    assert_equal [other.id, @editor.id], @diagram.operations.order(:sequence).pluck(:member_id)
    assert_equal({ "x" => 20, "y" => 0 }, @diagram.reload.document["nodes"].first["position"])
  end

  test "viewers cannot submit operations" do
    viewer = add_member(@workspace, role: "viewer")
    outcome = submit(move, member: viewer)

    assert_equal "FORBIDDEN", outcome.code
    assert_equal 0, @diagram.reload.revision
    assert_empty @diagram.operations
  end

  test "a member demoted while connected is refused from the next operation" do
    submit(move)
    Membership.find_by(member: @editor).update!(role: "viewer")

    assert_equal "FORBIDDEN", submit(move("a", 9), client_op_id: "2").code
  end

  test "nothing is accepted while collaboration is off" do
    @diagram.update!(collaboration_enabled: false)

    assert_equal "COLLABORATION_OFF", submit(move).code
  end

  test "a malformed operation is rejected before the diagram is touched" do
    outcome = submit({ "type" => "node.update", "id" => "a", "fields" => { "id" => "b" } })

    assert_equal "INVALID", outcome.code
    assert_match "unknown fields", outcome.message
  end

  test "an operation that would make the document invalid is rejected and rolled back" do
    outcome = submit({ "type" => "node.update", "id" => "a", "fields" => { "style" => { "fill" => "not a colour" } } })

    assert_equal "INVALID", outcome.code
    assert_match "would make the diagram invalid", outcome.message
    assert_match "invalid style.fill", outcome.message
    assert_equal 0, @diagram.reload.revision
    assert_empty @diagram.operations
  end

  test "operations larger than 256 KB are rejected" do
    huge = { "type" => "node.update", "id" => "a", "fields" => { "data" => { "text" => "x" * 270_000 } } }

    assert_equal "TOO_LARGE", submit(huge).code
  end

  test "the log keeps only the most recent operations" do
    stub_const(OperationSubmit, :LOG_LIMIT, 3) do
      5.times { |index| submit(move("a", index), client_op_id: index.to_s) }
    end

    assert_equal [3, 4, 5], @diagram.operations.order(:sequence).pluck(:sequence)
  end

  private

  def stub_const(owner, name, value)
    original = owner.const_get(name)
    owner.send(:remove_const, name)
    owner.const_set(name, value)
    yield
  ensure
    owner.send(:remove_const, name)
    owner.const_set(name, original)
  end
end
