module Types
  class WorkspaceType < BaseObject
    description "A makerspace the signed-in member belongs to"

    field :id, ID, null: false
    field :name, String, null: false
    field :slug, String, null: false
    field :role, RoleEnum, null: false, description: "The signed-in member's role here"
    field :can_edit, Boolean, null: false
    field :navigation_mode, NavigationModeEnum, null: false, description: "The default for members without their own navigation mode"

    delegate :role, to: :membership

    def can_edit
      membership.can_edit?
    end

    private

    def membership
      AccessPolicy.membership!(require_member!, object.id)
    end
  end
end
