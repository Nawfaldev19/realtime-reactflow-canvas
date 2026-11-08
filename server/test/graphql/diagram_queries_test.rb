require "test_helper"

class DiagramQueriesTest < ActionDispatch::IntegrationTest
  include GraphqlHelpers

  setup do
    @workspace = create_workspace(name: "Riverside Makers")
    @member = add_member(@workspace, role: "viewer")
    @author = add_member(@workspace, create_member(name: "Ada Okafor"), role: "owner")
  end

  test "workspaces lists the viewer's workspaces with their role" do
    body = graphql("{ workspaces { name role canEdit } }", as: @member)

    assert_equal [{ "name" => "Riverside Makers", "role" => "VIEWER", "canEdit" => false }], body.dig("data", "workspaces")
  end

  test "diagrams lists summaries, most recently updated first" do
    older = create_diagram(@workspace, title: "Older", author: @author)
    newer = travel(1.minute) { create_diagram(@workspace, title: "Newer", author: @author) }
    query = "query($id: ID!) { diagrams(workspaceId: $id) { id title nodeCount edgeCount canEdit updatedBy { name } } }"
    list = graphql(query, variables: { id: @workspace.id }, as: @member).dig("data", "diagrams")

    assert_equal [newer.id.to_s, older.id.to_s], list.pluck("id")
    assert_equal({ "id" => newer.id.to_s, "title" => "Newer", "nodeCount" => 3, "edgeCount" => 2, "canEdit" => false,
                   "updatedBy" => { "name" => "Ada Okafor" } }, list.first)
  end

  test "a list that asks for documents still gets them" do
    create_diagram(@workspace)
    list = graphql("query($id: ID!) { diagrams(workspaceId: $id) { document viewSettings } }", variables: { id: @workspace.id },
                                                                                               as: @member)

    assert_equal 3, list.dig("data", "diagrams", 0, "document", "nodes").size
    assert_equal "fitWidth", list.dig("data", "diagrams", 0, "viewSettings", "openingView", "mode")
  end

  test "diagram returns the full document, revision and view settings" do
    diagram = create_diagram(@workspace)
    query = "query($id: ID!) { diagram(id: $id) { title revision document viewSettings workspace { name } } }"
    body = graphql(query, variables: { id: diagram.id }, as: @member).dig("data", "diagram")

    assert_equal diagram.document, body["document"]
    assert_equal [0, "Riverside Makers"], [body["revision"], body.dig("workspace", "name")]
  end

  test "a missing diagram is NOT_FOUND" do
    assert_equal ["NOT_FOUND"], error_codes(graphql('{ diagram(id: "0") { id } }', as: @member))
  end
end
