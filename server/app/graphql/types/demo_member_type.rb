module Types
  class DemoMemberType < BaseObject
    description "A demo person shown on the sign-in picker"

    field :id, ID, null: false
    field :name, String, null: false
    field :initials, String, null: false
    field :summary, String, null: false, description: "Roles by workspace, for example 'Owner at Riverside Makers'"

    def summary
      object.memberships.sort_by(&:id).map { |membership| "#{membership.role.capitalize} at #{membership.workspace.name}" }.join(", ")
    end
  end
end
