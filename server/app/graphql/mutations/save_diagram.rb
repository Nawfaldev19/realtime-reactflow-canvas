module Mutations
  class SaveDiagram < BaseMutation
    description <<~TEXT
      Owners and editors. Replaces the document (and optionally the view settings) when `baseRevision`
      equals the stored revision. A stale save returns a REVISION_CONFLICT error and the stored diagram.
    TEXT

    argument :id, ID
    argument :base_revision, Int
    argument :document, GraphQL::Types::JSON
    argument :view_settings, GraphQL::Types::JSON, required: false

    field :diagram, Types::DiagramType, description: "The saved diagram, or the stored one after a conflict"

    def resolve(id:, base_revision:, document:, view_settings: nil)
      member = require_member!
      diagram = AccessPolicy.editable_diagram!(member, id)
      result = DiagramSave.call(diagram: diagram, member: member, base_revision: base_revision, document: document,
                                view_settings: view_settings)
      respond(result, :diagram)
    end
  end
end
