module Mutations
  class SetWorkspaceNavigationMode < BaseMutation
    description "Owners only. Sets the navigation mode for members of the workspace who have not chosen their own."

    argument :workspace_id, ID
    argument :mode, Types::NavigationModeEnum

    field :workspace, Types::WorkspaceType

    def resolve(workspace_id:, mode:)
      membership = AccessPolicy.membership!(require_member!, workspace_id)
      raise AccessPolicy::Forbidden unless membership.owner?

      membership.workspace.update!(navigation_mode: mode)
      { workspace: membership.workspace, errors: [] }
    end
  end
end
