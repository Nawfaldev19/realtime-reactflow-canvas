require "test_helper"

class WorkspaceTest < ActiveSupport::TestCase
  test "requires a name and a unique lowercase slug" do
    create_workspace.update!(slug: "riverside")

    assert_not_predicate Workspace.new(name: "", slug: "other"), :valid?
    assert_not_predicate Workspace.new(name: "Copy", slug: "riverside"), :valid?
    assert_not_predicate Workspace.new(name: "Bad", slug: "Not Valid"), :valid?
  end

  test "destroying a workspace removes its memberships and diagrams" do
    workspace = create_workspace
    add_member(workspace)
    create_diagram(workspace)

    assert_difference -> { Membership.count } => -1, -> { Diagram.count } => -1 do
      workspace.destroy!
    end
  end

  test "defaults to pan navigation and accepts only pan or scroll" do
    workspace = create_workspace

    assert_equal "pan", workspace.navigation_mode
    assert_not_predicate workspace.tap { |w| w.navigation_mode = "zoom" }, :valid?
  end
end
