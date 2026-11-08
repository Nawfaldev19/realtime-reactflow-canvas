# Saves a whole document with an optimistic revision check. The save is only
# accepted when it was built on the diagram's current revision; otherwise it
# fails with REVISION_CONFLICT and returns the stored diagram so the client
# can rebase its pending changes on it. The row lock keeps the check and the
# write atomic (SQLite serializes writers; on a server database it is a real
# row lock). While live collaboration is on, the server is the only writer
# (OperationSubmit), so whole-document saves are refused.
class DiagramSave
  CONFLICT = "REVISION_CONFLICT".freeze
  COLLABORATING = "COLLABORATION_ACTIVE".freeze

  def self.call(...) = new(...).call

  def initialize(diagram:, member:, base_revision:, document:, view_settings: nil)
    @diagram = diagram
    @member = member
    @base_revision = base_revision
    @document = document
    @view_settings = view_settings
  end

  def call
    Diagram.transaction do
      @diagram.lock!
      if @diagram.collaboration_enabled
        message = "Live collaboration is on, so changes are saved as you make them"
        ServiceResult.failure([{ field: nil, code: COLLABORATING, message: message }], record: @diagram)
      elsif @diagram.revision == @base_revision
        write
      else
        ServiceResult.failure([{ field: nil, code: CONFLICT, message: "This diagram was changed elsewhere since you opened it" }],
                              record: @diagram)
      end
    end
  end

  private

  def write
    @diagram.assign_attributes(document: @document, revision: @diagram.revision + 1, updated_by: @member)
    @diagram.view_settings = @view_settings unless @view_settings.nil?
    @diagram.save ? ServiceResult.success(@diagram) : ServiceResult.from_model_errors(@diagram)
  end
end
