module Mutations
  class RenameDiagram < BaseMutation
    description "Owners and editors. Renaming does not change the document revision."

    argument :id, ID
    argument :title, String

    field :diagram, Types::DiagramType

    def resolve(id:, title:)
      member = require_member!
      diagram = AccessPolicy.editable_diagram!(member, id)
      result = if diagram.update(title: title.strip, updated_by: member)
                 ServiceResult.success(diagram)
               else
                 ServiceResult.from_model_errors(diagram)
               end
      respond(result, :diagram)
    end
  end
end
