module Mutations
  class RestoreVersion < BaseMutation
    description <<~TEXT
      Owners and editors. Starts restoring a version: the diagram as stored now is kept as a "Before
      restoring vN" version (unless nothing changed since the latest version), and the version to restore
      is returned. The editor then applies the restore as one operation, which the collaboration channel
      (or, with collaboration off, saveDiagram) stores and every open editor receives, and which the
      person can undo in one step.
    TEXT

    argument :version_id, ID

    field :version, Types::DiagramVersionType, description: "The version to restore"
    field :checkpoint, Types::DiagramVersionType, description: "The version that holds the diagram as it was before the restore"

    def resolve(version_id:)
      member = require_member!
      version = AccessPolicy.writable_version!(member, version_id)
      outcome = VersionCapture.call(diagram: version.diagram, member: member, kind: "restore", label: "Before restoring v#{version.number}")
      { version: version, checkpoint: outcome.version, errors: outcome.errors }
    end
  end
end
