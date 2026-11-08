module Types
  class DiagramVersionType < BaseObject
    description "An immutable snapshot of a diagram. `document` and `viewSettings` are only loaded when requested."

    field :id, ID, null: false
    field :number, Int, null: false, description: "Numbered per diagram, from 1"
    field :label, String
    field :kind, VersionKindEnum, null: false
    field :revision, Int, null: false, description: "The diagram's revision when the version was taken"
    field :author, MemberType, null: false
    field :created_at, GraphQL::Types::ISO8601DateTime, null: false
    field :document, GraphQL::Types::JSON, null: false
    field :view_settings, GraphQL::Types::JSON, null: false

    # Lists select only summary columns; a list that asks for documents gets
    # the full rows in one batched query.
    delegate :document, :view_settings, to: :full_record

    def author
      dataloader.with(Sources::RecordById, Member).load(object.author_id)
    end

    private

    def full_record
      object.has_attribute?(:document) ? object : dataloader.with(Sources::RecordById, DiagramVersion).load(object.id)
    end
  end
end
