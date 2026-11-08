module Types
  class RoleEnum < BaseEnum
    description "A member's role inside one workspace"

    value "OWNER", "Edits every diagram and manages the workspace", value: "owner"
    value "EDITOR", "Creates and edits diagrams", value: "editor"
    value "VIEWER", "Opens diagrams read-only", value: "viewer"
  end
end
