module Types
  class MemberType < BaseObject
    description "A person in the demo"

    field :id, ID, null: false
    field :name, String, null: false
    field :initials, String, null: false
  end
end
