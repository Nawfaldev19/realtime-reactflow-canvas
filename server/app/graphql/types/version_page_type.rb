module Types
  class VersionPageType < BaseObject
    description "One page of a diagram's versions, newest first"

    field :nodes, [DiagramVersionType], null: false
    field :total_count, Int, null: false
    field :has_next_page, Boolean, null: false
    field :end_cursor, String, description: "Pass as `after` to load the next page; null on the last page"
  end
end
