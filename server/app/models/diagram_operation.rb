# One accepted collaborative operation, in the diagram's sequence order. The
# log is bounded (see OperationSubmit::LOG_LIMIT): it only has to cover the
# gap of a client that reconnects; older clients resync from a snapshot.
class DiagramOperation < ApplicationRecord
  belongs_to :diagram
  belongs_to :member

  scope :after_sequence, ->(sequence) { where(sequence: (sequence + 1)..).order(:sequence) }

  def readonly?
    persisted?
  end

  # The message every subscriber receives for this operation.
  def message
    { type: "op", seq: sequence, sessionId: session_id, clientOpId: client_op_id, memberId: member_id.to_s, op: operation }
  end
end
