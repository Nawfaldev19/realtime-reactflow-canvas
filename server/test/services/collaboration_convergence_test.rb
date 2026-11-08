require "test_helper"

# Two sessions submit interleaved, conflicting operations at the same time.
# Every client applies the broadcast stream in sequence order, so each one
# converges to the stored document.
class CollaborationConvergenceTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  teardown { [DiagramOperation, DiagramVersion, Diagram, Membership, Member, Workspace].each(&:delete_all) }

  def random_operation(random, session, index)
    ids = %w[a b c]
    case random.rand(5)
    when 0 then { "type" => "node.update", "id" => ids.sample(random: random),
                  "fields" => { "position" => { "x" => random.rand(500), "y" => index } } }
    when 1 then { "type" => "node.update", "id" => ids.sample(random: random),
                  "fields" => { "data" => { "text" => "#{session} #{index}" } } }
    when 2 then { "type" => "node.add", "node" => node_hash("#{session}-#{index}", number: 10 + index) }
    when 3 then { "type" => "edge.add",
                  "edge" => edge_hash("e-#{session}-#{index}", ids.sample(random: random), "#{session}-#{index - 1}") }
    else { "type" => "node.remove", "id" => (index.even? ? ids.sample(random: random) : "#{session}-#{index - 2}") }
    end
  end

  test "interleaved operations from two sessions converge to the stored document" do
    workspace = create_workspace
    members = Array.new(2) { add_member(workspace) }
    initial = document_with(nodes: [node_hash("a"), node_hash("b", number: 2), node_hash("c", number: 3)])
    diagram = create_diagram(workspace, document: initial)
    gate = Concurrent::CountDownLatch.new(1)

    threads = members.each_with_index.map do |member, session|
      Thread.new do
        random = Random.new(session + 1)
        gate.wait
        ActiveRecord::Base.connection_pool.with_connection do
          Array.new(25) do |index|
            OperationSubmit.call(diagram_id: diagram.id, member: member, session_id: "s#{session}", client_op_id: index.to_s,
                                 operation: random_operation(random, "s#{session}", index))
          end
        end
      end
    end
    gate.count_down
    outcomes = threads.flat_map(&:value)
    stream = DiagramOperation.where(diagram: diagram).order(:sequence).map(&:message)
    replayed = stream.reduce(initial) { |document, message| OperationApplier.apply(document, message[:op]).document }

    assert_equal 50, outcomes.count(&:accepted?)
    assert_equal (1..50).to_a, stream.pluck(:seq)
    assert_equal diagram.reload.document, replayed
  end
end
