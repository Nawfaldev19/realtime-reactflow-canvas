module Types
  class ViewerType < BaseObject
    description "The signed-in member"

    field :id, ID, null: false
    field :name, String, null: false
    field :email, String, null: false
    field :initials, String, null: false
    field :navigation_mode, NavigationModeEnum, description: "The member's own navigation mode; null uses each workspace's default"
  end
end
