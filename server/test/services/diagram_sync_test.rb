require "test_helper"

class DiagramSyncTest < ActiveSupport::TestCase
  setup do
    @workspace = create_workspace
    @member = add_member(@workspace)
    @diagram = create_diagram(@workspace, document: document_with(nodes: [node_hash("a")]))
  end

  def submit(id)
    OperationSubmit.call(diagram_id: @diagram.id, member: @member, session_id: "s", client_op_id: id,
                         operation: { "type" => "node.update", "id" => "a", "fields" => { "z" => id.to_i } })
  end

  test "a client that is up to date gets an empty list of operations" do
    reply = DiagramSync.reply(@diagram.id, 0)

    assert_equal({ type: "sync", revision: 0, enabled: true, mode: "ops", ops: [] }, reply)
  end

  test "a client behind gets the operations it missed, oldest first, as broadcast" do
    %w[1 2 3].each { |id| submit(id) }
    reply = DiagramSync.reply(@diagram.id, 1)

    assert_equal "ops", reply[:mode]
    assert_equal [2, 3], reply[:ops].pluck(:seq)
    assert_equal DiagramOperation.find_by(sequence: 2).message, reply[:ops].first
  end

  test "a new client, or one with an unknown or future number, gets a snapshot" do
    submit("1")

    [nil, 7, -1].each do |last_seq|
      reply = DiagramSync.reply(@diagram.id, last_seq)

      assert_equal "snapshot", reply[:mode], last_seq.inspect
      assert_equal 1, reply[:revision]
      assert_equal @diagram.reload.document, reply[:document]
    end
  end

  test "revisions written by whole-document saves are not in the log, so they need a snapshot" do
    @diagram.update!(revision: 4)
    submit("5")

    assert_equal "snapshot", DiagramSync.reply(@diagram.id, 3)[:mode]
    assert_equal "ops", DiagramSync.reply(@diagram.id, 4)[:mode]
  end
end
