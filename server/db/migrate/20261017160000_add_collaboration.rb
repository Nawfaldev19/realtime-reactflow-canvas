class AddCollaboration < ActiveRecord::Migration[8.0]
  def change
    add_column :diagrams, :collaboration_enabled, :boolean, default: true, null: false

    # The recent operation stream of each diagram, kept for resynchronizing
    # clients after a gap or a reconnect (a bounded log, pruned on write).
    create_table :diagram_operations do |t|
      t.references :diagram, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :member, null: false, foreign_key: true
      t.integer :sequence, null: false
      t.string :session_id, null: false
      t.string :client_op_id, null: false
      t.json :operation, null: false
      t.datetime :created_at, null: false
    end
    add_index :diagram_operations, %i[diagram_id sequence], unique: true
    add_index :diagram_operations, %i[diagram_id member_id session_id client_op_id], unique: true
  end
end
