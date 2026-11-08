require "test_helper"

class DiagramMutationsTest < ActionDispatch::IntegrationTest
  include GraphqlHelpers

  SAVE = <<~GQL.freeze
    mutation($id: ID!, $base: Int!, $doc: JSON!, $settings: JSON) {
      saveDiagram(id: $id, baseRevision: $base, document: $doc, viewSettings: $settings) {
        diagram { revision document updatedBy { name } }
        errors { field message code }
      }
    }
  GQL

  setup do
    @workspace = create_workspace
    @editor = add_member(@workspace, create_member(name: "Ben Lindqvist"), role: "editor")
    @viewer = add_member(@workspace, role: "viewer")
    @diagram = create_diagram(@workspace, collaboration: false)
    @document = document_with(nodes: [node_hash("moved").merge("position" => { "x" => 240, "y" => 80 })])
  end

  def save(base:, as: @editor, document: @document, settings: nil)
    graphql(SAVE, variables: { id: @diagram.id, base: base, doc: document, settings: settings }, as: as)
  end

  test "createDiagram starts from the starter plan and records a first version" do
    query = 'mutation($id: ID!) { createDiagram(workspaceId: $id, title: "  Turn a bowl ") ' \
            "{ diagram { title revision nodeCount canEdit } errors { message } } }"

    assert_difference -> { DiagramVersion.count } do
      body = graphql(query, variables: { id: @workspace.id }, as: @editor).dig("data", "createDiagram")

      assert_equal({ "title" => "Turn a bowl", "revision" => 0, "nodeCount" => 3, "canEdit" => true }, body["diagram"])
    end
  end

  test "createDiagram reports a blank title as a field error" do
    query = 'mutation($id: ID!) { createDiagram(workspaceId: $id, title: " ") { diagram { id } errors { field } } }'
    body = graphql(query, variables: { id: @workspace.id }, as: @editor).dig("data", "createDiagram")

    assert_nil body["diagram"]
    assert_equal "title", body.dig("errors", 0, "field")
  end

  test "saveDiagram on the current revision stores the document" do
    body = save(base: 0).dig("data", "saveDiagram")

    assert_empty body["errors"]
    assert_equal [1, @document, "Ben Lindqvist"],
                 [body.dig("diagram", "revision"), body.dig("diagram", "document"), body.dig("diagram", "updatedBy", "name")]
    assert_equal 240, @diagram.reload.document.dig("nodes", 0, "position", "x")
  end

  test "a stale saveDiagram returns REVISION_CONFLICT with the stored diagram" do
    save(base: 0)
    body = save(base: 0, document: DiagramDocument.empty).dig("data", "saveDiagram")

    assert_equal "REVISION_CONFLICT", body.dig("errors", 0, "code")
    assert_equal [1, @document], [body.dig("diagram", "revision"), body.dig("diagram", "document")]
  end

  test "saveDiagram rejects a malformed document" do
    body = save(base: 0, document: { "schemaVersion" => 1 }).dig("data", "saveDiagram")

    assert_nil body["diagram"]
    assert_equal "document", body.dig("errors", 0, "field")
  end

  test "saveDiagram can update the view settings" do
    settings = ViewSettings.defaults.deep_merge("openingView" => { "mode" => "fitAll" })
    save(base: 0, settings: settings)

    assert_equal "fitAll", @diagram.reload.view_settings.dig("openingView", "mode")
  end

  test "renameDiagram changes the title but not the revision" do
    query = 'mutation($id: ID!) { renameDiagram(id: $id, title: " Lamp v2 ") { diagram { title revision } errors { message } } }'
    body = graphql(query, variables: { id: @diagram.id }, as: @editor).dig("data", "renameDiagram")

    assert_equal({ "title" => "Lamp v2", "revision" => 0 }, body["diagram"])
  end

  test "renameDiagram rejects a blank title" do
    query = 'mutation($id: ID!) { renameDiagram(id: $id, title: "") { diagram { id } errors { field } } }'

    assert_equal "title", graphql(query, variables: { id: @diagram.id }, as: @editor).dig("data", "renameDiagram", "errors", 0, "field")
  end

  test "deleteDiagram removes the diagram" do
    query = "mutation($id: ID!) { deleteDiagram(id: $id) { deletedId errors { message } } }"
    body = graphql(query, variables: { id: @diagram.id }, as: @editor).dig("data", "deleteDiagram")

    assert_equal @diagram.id.to_s, body["deletedId"]
    assert_not Diagram.exists?(@diagram.id)
  end

  test "viewers are read-only" do
    queries = [
      ['mutation($id: ID!) { createDiagram(workspaceId: $id, title: "x") { diagram { id } } }', { id: @workspace.id }],
      ['mutation($id: ID!) { renameDiagram(id: $id, title: "x") { diagram { id } } }', { id: @diagram.id }],
      ["mutation($id: ID!) { deleteDiagram(id: $id) { deletedId } }", { id: @diagram.id }]
    ]

    assert_equal ["FORBIDDEN"], error_codes(save(base: 0, as: @viewer))
    queries.each { |query, variables| assert_equal ["FORBIDDEN"], error_codes(graphql(query, variables: variables, as: @viewer)) }
    assert_equal 0, @diagram.reload.revision
  end
end
