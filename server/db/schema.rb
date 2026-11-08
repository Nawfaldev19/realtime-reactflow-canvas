# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_10_17_180000) do
  create_table "diagram_operations", force: :cascade do |t|
    t.integer "diagram_id", null: false
    t.integer "member_id", null: false
    t.integer "sequence", null: false
    t.string "session_id", null: false
    t.string "client_op_id", null: false
    t.json "operation", null: false
    t.datetime "created_at", null: false
    t.index ["diagram_id", "sequence"], name: "index_diagram_operations_on_diagram_id_and_sequence", unique: true
    t.index ["diagram_id", "member_id", "session_id", "client_op_id"], name: "idx_on_diagram_id_member_id_session_id_client_op_id_dc1be35a64", unique: true
    t.index ["member_id"], name: "index_diagram_operations_on_member_id"
  end

  create_table "diagram_versions", force: :cascade do |t|
    t.integer "diagram_id", null: false
    t.integer "workspace_id", null: false
    t.integer "author_id", null: false
    t.integer "revision", null: false
    t.string "label"
    t.json "document", null: false
    t.json "view_settings", null: false
    t.datetime "created_at", null: false
    t.integer "number", null: false
    t.string "kind", default: "manual", null: false
    t.index ["author_id"], name: "index_diagram_versions_on_author_id"
    t.index ["diagram_id", "created_at"], name: "index_diagram_versions_on_diagram_id_and_created_at"
    t.index ["diagram_id", "number"], name: "index_diagram_versions_on_diagram_id_and_number", unique: true
    t.index ["diagram_id"], name: "index_diagram_versions_on_diagram_id"
    t.index ["workspace_id"], name: "index_diagram_versions_on_workspace_id"
  end

  create_table "diagrams", force: :cascade do |t|
    t.integer "workspace_id", null: false
    t.string "title", null: false
    t.json "document", null: false
    t.integer "revision", default: 0, null: false
    t.json "view_settings", null: false
    t.integer "node_count", default: 0, null: false
    t.integer "edge_count", default: 0, null: false
    t.integer "created_by_id"
    t.integer "updated_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "collaboration_enabled", default: true, null: false
    t.index ["created_by_id"], name: "index_diagrams_on_created_by_id"
    t.index ["updated_by_id"], name: "index_diagrams_on_updated_by_id"
    t.index ["workspace_id", "updated_at"], name: "index_diagrams_on_workspace_id_and_updated_at"
    t.index ["workspace_id"], name: "index_diagrams_on_workspace_id"
  end

  create_table "members", force: :cascade do |t|
    t.string "name", null: false
    t.string "email", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "navigation_mode"
    t.index ["email"], name: "index_members_on_email", unique: true
  end

  create_table "memberships", force: :cascade do |t|
    t.integer "workspace_id", null: false
    t.integer "member_id", null: false
    t.string "role", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["member_id"], name: "index_memberships_on_member_id"
    t.index ["workspace_id", "member_id"], name: "index_memberships_on_workspace_id_and_member_id", unique: true
    t.index ["workspace_id"], name: "index_memberships_on_workspace_id"
  end

  create_table "workspaces", force: :cascade do |t|
    t.string "name", null: false
    t.string "slug", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "navigation_mode", default: "pan", null: false
    t.index ["slug"], name: "index_workspaces_on_slug", unique: true
  end

  add_foreign_key "diagram_operations", "diagrams", on_delete: :cascade
  add_foreign_key "diagram_operations", "members"
  add_foreign_key "diagram_versions", "diagrams", on_delete: :cascade
  add_foreign_key "diagram_versions", "members", column: "author_id"
  add_foreign_key "diagram_versions", "workspaces"
  add_foreign_key "diagrams", "members", column: "created_by_id"
  add_foreign_key "diagrams", "members", column: "updated_by_id"
  add_foreign_key "diagrams", "workspaces"
  add_foreign_key "memberships", "members"
  add_foreign_key "memberships", "workspaces"
end
