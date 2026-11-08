require "test_helper"

class DiagramTest < ActiveSupport::TestCase
  setup { @workspace = create_workspace }

  test "defaults to an empty document, revision 0 and default view settings" do
    diagram = @workspace.diagrams.create!(title: "Blank")

    assert_equal DiagramDocument.empty, diagram.document
    assert_equal 0, diagram.revision
    assert_equal ViewSettings.defaults, diagram.view_settings
  end

  test "keeps node and edge counts in step with the document" do
    diagram = create_diagram(@workspace)

    assert_equal [3, 2], [diagram.node_count, diagram.edge_count]

    diagram.update!(document: document_with(nodes: [node_hash("a")]))

    assert_equal [1, 0], [diagram.node_count, diagram.edge_count]
  end

  test "rejects a malformed document or view settings" do
    diagram = create_diagram(@workspace)
    diagram.document = { "nodes" => "nope" }
    diagram.view_settings = { "openingView" => {} }

    assert_not_predicate diagram, :valid?
    assert_includes diagram.errors.attribute_names, :document
    assert_includes diagram.errors.attribute_names, :view_settings
  end

  test "requires a title of at most 120 characters" do
    assert_not_predicate @workspace.diagrams.new(title: " "), :valid?
    assert_not_predicate @workspace.diagrams.new(title: "x" * 121), :valid?
  end

  test "visible_to returns only diagrams in the member's workspaces" do
    member = add_member(@workspace, role: "viewer")
    mine = create_diagram(@workspace)
    create_diagram(create_workspace)

    assert_equal [mine], Diagram.visible_to(member).to_a
  end
end
