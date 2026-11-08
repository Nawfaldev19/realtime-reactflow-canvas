module Mutations
  class CreateDiagram < BaseMutation
    description "Owners and editors. The new diagram starts with a three-node starter plan."

    argument :workspace_id, ID
    argument :title, String

    field :diagram, Types::DiagramType

    def resolve(workspace_id:, title:)
      member = require_member!
      membership = AccessPolicy.editable_membership!(member, workspace_id)
      title = title.strip
      diagram = membership.workspace.diagrams.new(title: title, document: DocumentBuilder.starter(title.presence || "Start"),
                                                  created_by: member, updated_by: member)
      result = Diagram.transaction do
        next ServiceResult.from_model_errors(diagram) unless diagram.save

        DiagramVersion.capture!(diagram, author: member, kind: "created", label: "Created")
        ServiceResult.success(diagram)
      end
      respond(result, :diagram)
    end
  end
end
