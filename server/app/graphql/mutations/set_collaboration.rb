module Mutations
  class SetCollaboration < BaseMutation
    description <<~TEXT
      Owners. Turns live collaboration on or off for a diagram. Every open editor is told at once through
      the diagram's channel: with it on, edits are operations the server orders and stores; with it off,
      each editor autosaves whole documents with a revision check.
    TEXT

    argument :id, ID
    argument :enabled, Boolean

    field :diagram, Types::DiagramType

    def resolve(id:, enabled:)
      member = require_member!
      diagram = AccessPolicy.owned_diagram!(member, id)
      diagram.with_lock { diagram.update!(collaboration_enabled: enabled) }
      DiagramChannel.announce(diagram.id, { type: "collaboration", enabled: enabled, by: member.name })
      respond(ServiceResult.success(diagram), :diagram)
    end
  end
end
