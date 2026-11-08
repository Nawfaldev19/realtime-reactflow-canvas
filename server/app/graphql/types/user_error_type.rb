module Types
  class UserErrorType < BaseObject
    description "A problem the member can act on. `field` is null for whole-record problems."

    field :field, String
    field :message, String, null: false
    field :code, String, description: "Machine-readable reason, for example REVISION_CONFLICT"
  end
end
