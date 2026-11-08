module Types
  class MutationType < BaseObject
    field :sign_in_as_demo, mutation: Mutations::SignInAsDemo, null: false
    field :create_diagram, mutation: Mutations::CreateDiagram, null: false
    field :save_diagram, mutation: Mutations::SaveDiagram, null: false
    field :rename_diagram, mutation: Mutations::RenameDiagram, null: false
    field :delete_diagram, mutation: Mutations::DeleteDiagram, null: false
    field :update_view_settings, mutation: Mutations::UpdateViewSettings, null: false
    field :save_version, mutation: Mutations::SaveVersion, null: false
    field :restore_version, mutation: Mutations::RestoreVersion, null: false
    field :copy_version, mutation: Mutations::CopyVersion, null: false
    field :set_collaboration, mutation: Mutations::SetCollaboration, null: false
    field :set_navigation_mode, mutation: Mutations::SetNavigationMode, null: false
    field :set_workspace_navigation_mode, mutation: Mutations::SetWorkspaceNavigationMode, null: false
  end
end
