require "test_helper"

class DiagramVersionTest < ActiveSupport::TestCase
  test "captures the diagram's document, settings, revision and workspace" do
    workspace = create_workspace
    author = add_member(workspace)
    diagram = create_diagram(workspace, author: author)
    diagram.update!(revision: 4)

    version = DiagramVersion.capture!(diagram, author: author, label: "Checkpoint")

    assert_equal [diagram.document, diagram.view_settings], [version.document, version.view_settings]
    assert_equal [4, workspace.id, "Checkpoint"], [version.revision, version.workspace_id, version.label]
  end

  test "is immutable once saved" do
    workspace = create_workspace
    diagram = create_diagram(workspace)
    version = DiagramVersion.capture!(diagram, author: add_member(workspace))

    assert_raises(ActiveRecord::ReadOnlyRecord) { version.update!(label: "Changed") }
  end

  test "rejects an invalid snapshot" do
    workspace = create_workspace
    diagram = create_diagram(workspace)
    version = DiagramVersion.new(diagram: diagram, author: add_member(workspace), revision: 0, document: {}, view_settings: {})

    assert_not_predicate version, :valid?
  end

  test "is deleted with its diagram, newest first" do
    workspace = create_workspace
    author = add_member(workspace)
    diagram = create_diagram(workspace)
    older = DiagramVersion.capture!(diagram, author: author)
    newer = travel(1.minute) { DiagramVersion.capture!(diagram, author: author) }

    assert_equal [newer, older], diagram.versions.newest_first.to_a
    assert_difference -> { DiagramVersion.count }, -2 do
      diagram.destroy!
    end
  end

  test "numbers versions per diagram and knows how each was made" do
    workspace = create_workspace
    author = add_member(workspace)
    first = create_diagram(workspace)
    second = create_diagram(workspace)

    numbers = [DiagramVersion.capture!(first, author: author, kind: "created"),
               DiagramVersion.capture!(first, author: author)].map(&:number)

    assert_equal [1, 2], numbers
    assert_equal 1, DiagramVersion.capture!(second, author: author).number
    assert_equal "manual", first.versions.find_by(number: 2).kind
    assert_raises(ActiveRecord::RecordInvalid) { DiagramVersion.capture!(first, author: author, kind: "imported") }
  end
end
