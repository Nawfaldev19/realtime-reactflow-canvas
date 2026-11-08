require "test_helper"

# The version endpoints: listing with keyset pagination, loading versions by id
# for compare, saving, restoring and copying. Viewers may list and compare;
# saving, restoring and copying need an owner or editor.
class VersionHistoryTest < ActionDispatch::IntegrationTest
  include GraphqlHelpers

  LIST = <<~GQL.freeze
    query($id: ID!, $first: Int, $after: String) {
      diagram(id: $id) {
        versions(first: $first, after: $after) { totalCount hasNextPage endCursor nodes { number label kind author { name } createdAt } }
      }
    }
  GQL
  BY_ID = "query($ids: [ID!]!) { versions(ids: $ids) { id number document } }".freeze
  SAVE = <<~GQL.freeze
    mutation($id: ID!, $label: String, $automatic: Boolean) {
      saveVersion(diagramId: $id, label: $label, automatic: $automatic) { created version { number label kind } errors { field message } }
    }
  GQL
  RESTORE = <<~GQL.freeze
    mutation($id: ID!) {
      restoreVersion(versionId: $id) { version { number document } checkpoint { number kind label } errors { message } }
    }
  GQL
  COPY = <<~GQL.freeze
    mutation($id: ID!, $title: String) {
      copyVersion(versionId: $id, title: $title) { diagram { id title document } copyLog errors { field message } }
    }
  GQL

  setup do
    @workspace = create_workspace
    @editor = add_member(@workspace, create_member(name: "Ben Lindqvist"), role: "editor")
    @viewer = add_member(@workspace, create_member(name: "Cora Mbeki"), role: "viewer")
    @diagram = create_diagram(@workspace, author: @editor)
    @first = DiagramVersion.capture!(@diagram, author: @editor, kind: "created", label: "Created")
  end

  def list(as: @editor, **variables) = graphql(LIST, variables: { id: @diagram.id, **variables }, as: as)
  def save(as: @editor, **variables) = graphql(SAVE, variables: { id: @diagram.id, **variables }, as: as)

  def edit!(text)
    document = @diagram.document.deep_dup
    document["nodes"][1]["data"]["text"] = text
    @diagram.update!(document: document, revision: @diagram.revision + 1)
  end

  test "an editor saves a labelled version and everyone with access lists it with its author" do
    body = save(label: "Top glued").dig("data", "saveVersion")

    assert_equal [true, { "number" => 2, "label" => "Top glued", "kind" => "MANUAL" }], [body["created"], body["version"]]
    nodes = list(as: @viewer).dig("data", "diagram", "versions", "nodes")

    rows = nodes.map { |node| [node["number"], node["label"], node["kind"], node.dig("author", "name")] }

    assert_equal [[2, "Top glued", "MANUAL", "Ben Lindqvist"], [1, "Created", "CREATED", "Ben Lindqvist"]], rows
  end

  test "an automatic version is not made when nothing changed" do
    body = travel(11.minutes) { save(automatic: true).dig("data", "saveVersion") }

    assert_equal [false, 1], [body["created"], body.dig("version", "number")]
  end

  test "versions page newest first by cursor, and a version saved meanwhile never repeats a row" do
    5.times { |index| DiagramVersion.capture!(@diagram, author: @editor, label: "Pass #{index}") }
    page = list(first: 2).dig("data", "diagram", "versions")

    assert_equal [6, true, [6, 5]], [page["totalCount"], page["hasNextPage"], page["nodes"].pluck("number")]
    DiagramVersion.capture!(@diagram, author: @editor, label: "Meanwhile")
    numbers = []
    cursor = page["endCursor"]
    while cursor
      page = list(first: 2, after: cursor).dig("data", "diagram", "versions")
      numbers.concat(page["nodes"].pluck("number"))
      cursor = page["endCursor"]
    end

    assert_equal [4, 3, 2, 1], numbers
    assert_not page["hasNextPage"]
  end

  test "a page is at most 50 versions and a forged cursor is refused" do
    assert_equal [1], list(first: 500).dig("data", "diagram", "versions", "nodes").pluck("number")
    assert_equal ["INVALID_ARGUMENT"], error_codes(list(after: "bm90LWEtY3Vyc29y"))
    assert_equal ["INVALID_ARGUMENT"], error_codes(list(after: "%%%"))
  end

  test "a viewer loads versions by id to compare them" do
    second = DiagramVersion.capture!(@diagram, author: @editor)
    body = graphql(BY_ID, variables: { ids: [second.id, @first.id] }, as: @viewer)

    assert_equal [2, 1], body.dig("data", "versions").pluck("number")
    assert_equal @diagram.document, body.dig("data", "versions", 0, "document")
  end

  test "versions by id are checked one by one: one from another workspace refuses the whole request" do
    away = create_workspace(name: "Away")
    foreign = DiagramVersion.capture!(create_diagram(away), author: add_member(away))
    body = graphql(BY_ID, variables: { ids: [@first.id, foreign.id] }, as: @viewer)

    assert_equal ["NOT_FOUND"], error_codes(body)
    assert_nil body["data"]
    assert_equal ["INVALID_ARGUMENT"], error_codes(graphql(BY_ID, variables: { ids: (1..11).to_a }, as: @viewer))
  end

  test "viewers can list and compare but cannot save, restore or copy" do
    assert_equal ["FORBIDDEN"], error_codes(save(as: @viewer, label: "Mine"))
    assert_equal ["FORBIDDEN"], error_codes(graphql(RESTORE, variables: { id: @first.id }, as: @viewer))
    assert_equal ["FORBIDDEN"], error_codes(graphql(COPY, variables: { id: @first.id }, as: @viewer))
    assert_equal 1, DiagramVersion.count
    assert_equal 1, Diagram.count
  end

  test "signed-out requests and other workspaces are refused" do
    assert_equal ["UNAUTHENTICATED"], error_codes(graphql(SAVE, variables: { id: @diagram.id }))
    stranger = add_member(create_workspace(name: "Away"), role: "owner")

    assert_equal ["NOT_FOUND"], error_codes(save(as: stranger))
    assert_equal ["NOT_FOUND"], error_codes(list(as: stranger))
    assert_equal ["NOT_FOUND"], error_codes(graphql(RESTORE, variables: { id: @first.id }, as: stranger))
    assert_equal ["NOT_FOUND"], error_codes(graphql(COPY, variables: { id: @first.id }, as: stranger))
  end

  test "restoring keeps the current diagram as a version first and returns the version to restore" do
    edit!("Changed since")
    body = graphql(RESTORE, variables: { id: @first.id }, as: @editor).dig("data", "restoreVersion")

    assert_equal 1, body.dig("version", "number")
    assert_equal @first.document, body.dig("version", "document")
    assert_equal({ "number" => 2, "kind" => "RESTORE", "label" => "Before restoring v1" }, body["checkpoint"])
    assert_equal "Changed since", @diagram.versions.find_by(number: 2).document["nodes"][1]["data"]["text"]
    assert_equal 1, @diagram.reload.revision, "the restore itself is an operation the editor sends"
  end

  test "restoring an unchanged diagram does not add a checkpoint" do
    body = graphql(RESTORE, variables: { id: @first.id }, as: @editor).dig("data", "restoreVersion")

    assert_equal 1, body.dig("checkpoint", "number")
    assert_equal 1, @diagram.versions.count
  end

  test "copying a version makes a new diagram with fresh ids, the same keys and a first version" do
    body = graphql(COPY, variables: { id: @first.id }, as: @editor).dig("data", "copyVersion")
    copy = Diagram.find(body.dig("diagram", "id"))

    assert_equal ["Test plan (copy of v1)", []], [body.dig("diagram", "title"), body["copyLog"]]
    assert_empty copy.document["nodes"].pluck("id") & @first.document["nodes"].pluck("id")
    assert_equal @first.document["nodes"].pluck("key"), copy.document["nodes"].pluck("key")
    assert_equal [[1, "created", "Copied from Test plan v1"]], copy.versions.pluck(:number, :kind, :label)
    assert_equal @workspace, copy.workspace
  end

  test "a copy's title can be chosen and is validated like any title" do
    titled = graphql(COPY, variables: { id: @first.id, title: " Second table " }, as: @editor).dig("data", "copyVersion")
    blank = graphql(COPY, variables: { id: @first.id, title: "x" * 121 }, as: @editor).dig("data", "copyVersion")

    assert_equal "Second table", titled.dig("diagram", "title")
    assert_equal [nil, ["title"]], [blank["diagram"], blank["errors"].pluck("field")]
  end
end
