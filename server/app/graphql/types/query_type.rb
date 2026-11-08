module Types
  class QueryType < BaseObject
    field :viewer, ViewerType, description: "The signed-in member, or null"

    def viewer
      Current.member
    end

    field :demo_members, [DemoMemberType], null: false, description: "People available on the demo sign-in picker"

    def demo_members
      Member.includes(memberships: :workspace).order(:id)
    end

    field :workspaces, [WorkspaceType], null: false, description: "Workspaces the signed-in member belongs to"

    def workspaces
      require_member!.workspaces.order(:name, :id)
    end

    field :diagrams, [DiagramType], null: false, description: "Most recently updated first" do
      argument :workspace_id, ID
    end

    def diagrams(workspace_id:)
      membership = AccessPolicy.membership!(require_member!, workspace_id)
      membership.workspace.diagrams.recently_updated.select(Diagram.column_names - %w[document view_settings])
    end

    field :diagram, DiagramType, null: false do
      argument :id, ID
    end

    def diagram(id:)
      AccessPolicy.diagram!(require_member!, id)
    end

    MAX_VERSIONS_BY_ID = 10

    field :versions, [DiagramVersionType], null: false, description: <<~TEXT do
      Versions by id, in the order asked (compare loads two). Every id is checked: if the member cannot open
      the diagram of any one of them, the whole request is NOT_FOUND. At most #{MAX_VERSIONS_BY_ID} ids.
    TEXT
      argument :ids, [ID]
    end

    def versions(ids:)
      raise GraphqlErrors.invalid_argument("Ask for at most #{MAX_VERSIONS_BY_ID} versions at once") if ids.size > MAX_VERSIONS_BY_ID

      AccessPolicy.versions!(require_member!, ids)
    end
  end
end
