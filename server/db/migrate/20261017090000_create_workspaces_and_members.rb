class CreateWorkspacesAndMembers < ActiveRecord::Migration[8.0]
  def change
    create_table :workspaces do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.timestamps
    end
    add_index :workspaces, :slug, unique: true

    create_table :members do |t|
      t.string :name, null: false
      t.string :email, null: false
      t.timestamps
    end
    add_index :members, :email, unique: true

    create_table :memberships do |t|
      t.references :workspace, null: false, foreign_key: true
      t.references :member, null: false, foreign_key: true
      t.string :role, null: false
      t.timestamps
    end
    add_index :memberships, %i[workspace_id member_id], unique: true
  end
end
