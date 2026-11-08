# The reply to a client's join: everything it needs to catch up from the last
# sequence number it applied. When the operation log still holds every
# operation after that number, the reply lists them (oldest first); otherwise
# (a new client, a log that was pruned, revisions written by whole-document
# saves, or a number from the future) it is a full snapshot with its sequence.
# Read under the row lock, so the revision and the operations agree.
module DiagramSync
  module_function

  def reply(diagram_id, last_seq)
    Diagram.transaction do
      diagram = Diagram.lock.find(diagram_id)
      ops = replayable(diagram, last_seq)
      base = { type: "sync", revision: diagram.revision, enabled: diagram.collaboration_enabled }
      ops ? base.merge(mode: "ops", ops: ops.map(&:message)) : base.merge(mode: "snapshot", document: diagram.document)
    end
  end

  def replayable(diagram, last_seq)
    return nil unless last_seq.is_a?(Integer) && last_seq.between?(0, diagram.revision)
    return [] if last_seq == diagram.revision

    ops = diagram.operations.after_sequence(last_seq).to_a
    ops if ops.size == diagram.revision - last_seq
  end
end
