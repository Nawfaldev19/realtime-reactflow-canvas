module Mutations
  class UpdateViewSettings < BaseMutation
    description <<~TEXT
      Owners and editors. Replaces the view settings (opening view, background, animation, snapping).
      The document revision does not change, so this never conflicts with an edit to the nodes.
    TEXT

    argument :id, ID
    argument :view_settings, GraphQL::Types::JSON

    field :diagram, Types::DiagramType

    def resolve(id:, view_settings:)
      diagram = AccessPolicy.editable_diagram!(require_member!, id)
      diagram.view_settings = view_settings
      result = diagram.save ? ServiceResult.success(diagram) : ServiceResult.from_model_errors(diagram)
      respond(result, :diagram)
    end
  end
end
