# Pan or scroll navigation for viewing diagrams: a personal preference on the
# member (null means "use the workspace default") and a default per workspace.
class AddNavigationModes < ActiveRecord::Migration[8.0]
  def change
    add_column :members, :navigation_mode, :string
    add_column :workspaces, :navigation_mode, :string, null: false, default: "pan"
  end
end
