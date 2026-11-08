require "test_helper"

# Every entry point that takes a workspace or diagram id must refuse ids from a
# workspace the member does not belong to, and must answer NOT_FOUND rather
# than FORBIDDEN so ids from other workspaces cannot be probed.
class TenantIsolationTest < ActionDispatch::IntegrationTest
  include GraphqlHelpers

  setup do
    @home = create_workspace(name: "Home")
    @away = create_workspace(name: "Away")
    @member = add_member(@home, role: "owner")
    add_member(@away, create_member(name: "Stranger"), role: "owner")
    @foreign = create_diagram(@away, title: "Private plan")
  end

  test "workspaces never include another workspace" do
    assert_equal ["Home"], graphql("{ workspaces { name } }", as: @member).dig("data", "workspaces").pluck("name")
  end

  test "queries cannot reach another workspace" do
    assert_equal ["NOT_FOUND"],
                 error_codes(graphql("query($id: ID!) { diagrams(workspaceId: $id) { id } }", variables: { id: @away.id }, as: @member))
    assert_equal ["NOT_FOUND"],
                 error_codes(graphql("query($id: ID!) { diagram(id: $id) { title } }", variables: { id: @foreign.id }, as: @member))
  end

  test "mutations cannot reach another workspace" do
    id = @foreign.id
    mutations = [
      ["mutation($id: ID!) { createDiagram(workspaceId: $id, title: \"x\") { diagram { id } } }", { id: @away.id }],
      ["mutation($id: ID!, $doc: JSON!) { saveDiagram(id: $id, baseRevision: 0, document: $doc) { diagram { id } } }",
       { id: id, doc: DiagramDocument.empty }],
      ["mutation($id: ID!) { renameDiagram(id: $id, title: \"Mine now\") { diagram { id } } }", { id: id }],
      ["mutation($id: ID!) { deleteDiagram(id: $id) { deletedId } }", { id: id }]
    ]

    mutations.each { |query, variables| assert_equal ["NOT_FOUND"], error_codes(graphql(query, variables: variables, as: @member)) }
    assert_equal ["Private plan", 0], [@foreign.reload.title, @foreign.revision]
  end
end
