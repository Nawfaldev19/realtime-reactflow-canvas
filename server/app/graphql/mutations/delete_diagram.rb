module Mutations
  class DeleteDiagram < BaseMutation
    description "Owners and editors. Deletes the diagram and its versions."

    argument :id, ID

    field :deleted_id, ID

    def resolve(id:)
      diagram = AccessPolicy.editable_diagram!(require_member!, id)
      diagram.destroy!
      { deleted_id: diagram.id, errors: [] }
    end
  end
end
