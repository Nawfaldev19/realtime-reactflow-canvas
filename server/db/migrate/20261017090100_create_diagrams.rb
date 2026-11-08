class CreateDiagrams < ActiveRecord::Migration[8.0]
  def change
    create_table :diagrams do |t|
      t.references :workspace, null: false, foreign_key: true
      t.string :title, null: false
      t.json :document, null: false
      t.integer :revision, null: false, default: 0
      t.json :view_settings, null: false
      # Denormalized from the document so the diagram list never loads documents.
      t.integer :node_count, null: false, default: 0
      t.integer :edge_count, null: false, default: 0
      t.references :created_by, foreign_key: { to_table: :members }
      t.references :updated_by, foreign_key: { to_table: :members }
      t.timestamps
    end
    add_index :diagrams, %i[workspace_id updated_at]
  end
end
