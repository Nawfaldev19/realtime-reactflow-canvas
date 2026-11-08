module Mutations
  class SaveVersion < BaseMutation
    description <<~TEXT
      Owners and editors. Takes a version of the diagram as stored now. A manual version (the default) is
      always made. An automatic one (the editor's periodic version) is skipped when nothing changed since
      the latest version or when a version is less than five minutes old; `created` is then false and
      `version` is the latest one.
    TEXT

    argument :diagram_id, ID
    argument :label, String, required: false
    argument :automatic, Boolean, required: false, default_value: false

    field :version, Types::DiagramVersionType
    field :created, Boolean, null: false

    def resolve(diagram_id:, automatic:, label: nil)
      member = require_member!
      diagram = AccessPolicy.editable_diagram!(member, diagram_id)
      outcome = VersionCapture.call(diagram: diagram, member: member, kind: automatic ? "automatic" : "manual",
                                    label: automatic ? nil : label)
      { version: outcome.version, created: outcome.created, errors: outcome.errors }
    end
  end
end
