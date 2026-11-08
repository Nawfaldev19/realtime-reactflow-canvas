module Mutations
  class CopyVersion < BaseMutation
    description <<~TEXT
      Owners and editors. Makes a new diagram in the same workspace from a version. Every step and connector
      gets a new id and every reference (group parents, connector ends, the saved manual arrangement) is
      rewritten to the new ids; stable identity keys stay the same. `copyLog` lists references that could
      not be carried over.
    TEXT

    argument :version_id, ID
    argument :title, String, required: false, description: "Defaults to “<title> (copy of vN)”"

    field :diagram, Types::DiagramType
    field :copy_log, [String], null: false

    def resolve(version_id:, title: nil)
      member = require_member!
      version = AccessPolicy.writable_version!(member, version_id)
      copy = VersionCopy.call(version.document)
      result = create(version, member, copy.document, title.to_s.strip.presence || "#{version.diagram.title} (copy of v#{version.number})")
      { diagram: result.record, copy_log: copy.log, errors: result.errors }
    end

    private

    def create(version, member, document, title)
      diagram = version.workspace.diagrams.new(title: title, document: document, view_settings: version.view_settings,
                                               created_by: member, updated_by: member)
      Diagram.transaction do
        next ServiceResult.from_model_errors(diagram) unless diagram.save

        label = "Copied from #{version.diagram.title} v#{version.number}".truncate(80)
        DiagramVersion.capture!(diagram, author: member, kind: "created", label: label)
        ServiceResult.success(diagram)
      end
    end
  end
end
