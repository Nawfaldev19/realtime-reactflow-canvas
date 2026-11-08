# Accepts one collaborative operation: the server is the single writer of a
# collaborative diagram. Inside one transaction, with the diagram row locked,
# it checks the member's role and the collaboration switch, applies the
# operation to the stored document (OperationApplier), validates the result
# like any save, increments `revision` and records the operation under that
# number. The revision is the room's sequence number, so operations are
# totally ordered (docs/features/collaboration.md).
#
# A re-sent operation (same member, session and client operation id) is not
# applied twice: the stored entry is returned as a duplicate. The session id is
# minted by the server (DiagramChannel), and the member is part of the key, so
# one member's changes can never be taken for another's.
class OperationSubmit
  MAX_BYTES = 256.kilobytes
  LOG_LIMIT = 2000

  Outcome = Data.define(:status, :entry, :code, :message) do
    def accepted? = status == :accepted
    def duplicate? = status == :duplicate
  end

  def self.call(...) = new(...).call

  def initialize(diagram_id:, member:, session_id:, client_op_id:, operation:)
    @diagram_id = diagram_id
    @member = member
    @session_id = session_id
    @client_op_id = client_op_id
    @operation = operation
  end

  def call
    precheck || submit
  end

  private

  def precheck
    return reject("TOO_LARGE", "This change is too large to sync") if @operation.to_json.bytesize > MAX_BYTES

    problems = OperationShape.errors(@operation)
    reject("INVALID", "This change is not a valid operation: #{problems.first}") if problems.any?
  end

  # Anything but an accepted or duplicate operation rolls back, so a rejected
  # change leaves no trace.
  def submit
    outcome = nil
    Diagram.transaction do
      outcome = locked_submit(Diagram.lock.find(@diagram_id))
      raise ActiveRecord::Rollback if outcome.status == :rejected
    end
    outcome
  end

  def locked_submit(diagram)
    return reject("FORBIDDEN", "Your role in this workspace does not allow editing") unless editor?(diagram)
    return reject("COLLABORATION_OFF", "Live collaboration is turned off for this diagram") unless diagram.collaboration_enabled

    existing = diagram.operations.find_by(member_id: @member.id, session_id: @session_id, client_op_id: @client_op_id)
    return Outcome.new(status: :duplicate, entry: existing, code: nil, message: nil) if existing

    write(diagram)
  end

  # The role is read again for every operation, so a member demoted while
  # connected cannot keep editing.
  def editor?(diagram)
    Membership.find_by(workspace_id: diagram.workspace_id, member_id: @member.id)&.can_edit? || false
  end

  def write(diagram)
    result = OperationApplier.apply(diagram.document, @operation)
    diagram.assign_attributes(document: result.document, revision: diagram.revision + 1, updated_by: @member)
    return reject("INVALID", "This change would make the diagram invalid: #{diagram.errors.full_messages.first}") unless diagram.save

    entry = diagram.operations.create!(member: @member, sequence: diagram.revision, session_id: @session_id,
                                       client_op_id: @client_op_id, operation: @operation)
    diagram.operations.where(sequence: ..(diagram.revision - LOG_LIMIT)).delete_all
    Outcome.new(status: :accepted, entry: entry, code: nil, message: nil)
  end

  def reject(code, message) = Outcome.new(status: :rejected, entry: nil, code: code, message: message)
end
