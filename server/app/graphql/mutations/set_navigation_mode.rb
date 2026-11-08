module Mutations
  class SetNavigationMode < BaseMutation
    description "Sets the signed-in member's own navigation mode; null goes back to each workspace's default."

    argument :mode, Types::NavigationModeEnum, required: false

    field :viewer, Types::ViewerType

    def resolve(mode: nil)
      member = require_member!
      member.update!(navigation_mode: mode)
      { viewer: member, errors: [] }
    end
  end
end
