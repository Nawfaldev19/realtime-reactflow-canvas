require "test_helper"

# Runs real concurrent transactions, so it cannot use the default
# test transaction (other threads would not see uncommitted rows).
class DiagramSaveConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  teardown { [DiagramVersion, Diagram, Membership, Member, Workspace].each(&:delete_all) }

  test "of several saves built on the same revision, exactly one wins" do
    workspace = create_workspace
    member = add_member(workspace)
    diagram = create_diagram(workspace, collaboration: false)
    gate = Concurrent::CountDownLatch.new(1)

    threads = Array.new(4) do |index|
      Thread.new do
        gate.wait
        ActiveRecord::Base.connection_pool.with_connection do
          DiagramSave.call(diagram: Diagram.find(diagram.id), member: member, base_revision: 0,
                           document: document_with(nodes: [node_hash("writer-#{index}")]))
        end
      end
    end
    gate.count_down
    results = threads.map(&:value)

    assert_equal 1, results.count(&:success?)
    assert_equal 1, diagram.reload.revision
    assert_equal results.find(&:success?).record.document, diagram.document
  end
end
