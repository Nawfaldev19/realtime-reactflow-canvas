class AddVersionHistory < ActiveRecord::Migration[8.0]
  def up
    # A per-diagram version number ("v3") and how the version was made:
    # created (a new diagram or a copy), manual ("Save version"), automatic
    # (the periodic version) or restore (the state kept before a restore).
    add_column :diagram_versions, :number, :integer
    add_column :diagram_versions, :kind, :string, null: false, default: "manual"

    execute <<~SQL.squish
      UPDATE diagram_versions SET number = (
        SELECT COUNT(*) FROM diagram_versions AS earlier
        WHERE earlier.diagram_id = diagram_versions.diagram_id
          AND (earlier.created_at < diagram_versions.created_at
               OR (earlier.created_at = diagram_versions.created_at AND earlier.id <= diagram_versions.id))
      )
    SQL
    execute "UPDATE diagram_versions SET kind = 'created' WHERE label = 'Created'"

    change_column_null :diagram_versions, :number, false
    add_index :diagram_versions, %i[diagram_id number], unique: true
  end

  def down
    remove_index :diagram_versions, %i[diagram_id number]
    remove_column :diagram_versions, :kind
    remove_column :diagram_versions, :number
  end
end
