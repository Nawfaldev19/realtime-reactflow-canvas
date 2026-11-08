class CreateDiagramVersions < ActiveRecord::Migration[8.0]
  def change
    create_table :diagram_versions do |t|
      t.references :diagram, null: false, foreign_key: { on_delete: :cascade }
      t.references :workspace, null: false, foreign_key: true
      t.references :author, null: false, foreign_key: { to_table: :members }
      t.integer :revision, null: false
      t.string :label
      t.json :document, null: false
      t.json :view_settings, null: false
      t.datetime :created_at, null: false
    end
    add_index :diagram_versions, %i[diagram_id created_at]
  end
end
