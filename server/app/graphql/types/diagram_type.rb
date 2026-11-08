module Types
  class DiagramType < BaseObject
    description "A diagram. `document` and `viewSettings` are only loaded when requested."

    field :id, ID, null: false
    field :title, String, null: false
    field :revision, Int, null: false,
                          description: "Increments on every accepted save or collaborative operation (the room sequence number)"
    field :document, GraphQL::Types::JSON, null: false, description: "Version-1 document: nodes, edges, nextNumber"
    field :view_settings, GraphQL::Types::JSON, null: false
    field :node_count, Int, null: false
    field :edge_count, Int, null: false
    field :created_at, GraphQL::Types::ISO8601DateTime, null: false
    field :updated_at, GraphQL::Types::ISO8601DateTime, null: false
    field :updated_by, MemberType
    field :workspace, WorkspaceType, null: false
    field :can_edit, Boolean, null: false
    field :collaboration_enabled, Boolean, null: false,
                                           description: "Live collaboration: edits go through the operation channel, not saveDiagram"

    field :versions, VersionPageType, null: false,
                                      description: "Saved versions, newest first. Anyone who can open the diagram may list them." do
      argument :first, Int, required: false, default_value: 20, description: "Page size, 1 to #{VersionPage::MAX_SIZE}"
      argument :after, String, required: false, description: "The `endCursor` of the previous page"
    end

    # Lists select only summary columns; a list that asks for the document gets
    # the full rows in one batched query.
    delegate :document, :view_settings, to: :full_record

    def updated_by
      object.updated_by_id && dataloader.with(Sources::RecordById, Member).load(object.updated_by_id)
    end

    def workspace
      dataloader.with(Sources::RecordById, Workspace).load(object.workspace_id)
    end

    def versions(first:, after: nil)
      VersionPage.call(object, first: first, after: after)
    end

    def can_edit
      AccessPolicy.can_edit?(require_member!, object)
    end

    private

    def full_record
      object.has_attribute?(:document) ? object : dataloader.with(Sources::RecordById, Diagram).load(object.id)
    end
  end
end
