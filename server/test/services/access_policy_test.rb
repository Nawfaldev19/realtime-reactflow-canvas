require "test_helper"

class AccessPolicyTest < ActiveSupport::TestCase
  setup do
    @workspace = create_workspace
    @other = create_workspace(name: "Elsewhere")
    @viewer = add_member(@workspace, role: "viewer")
    @editor = add_member(@workspace, role: "editor")
    @diagram = create_diagram(@workspace)
  end

  test "members reach diagrams in their own workspaces" do
    assert_equal @diagram, AccessPolicy.diagram!(@viewer, @diagram.id)
    assert_equal @diagram, AccessPolicy.editable_diagram!(@editor, @diagram.id)
  end

  test "viewers cannot edit" do
    assert_raises(AccessPolicy::Forbidden) { AccessPolicy.editable_diagram!(@viewer, @diagram.id) }
    assert_raises(AccessPolicy::Forbidden) { AccessPolicy.editable_membership!(@viewer, @workspace.id) }
    assert_not AccessPolicy.can_edit?(@viewer, @diagram)
  end

  test "another workspace's diagram is not found, never forbidden" do
    foreign = create_diagram(@other)

    assert_raises(AccessPolicy::NotFound) { AccessPolicy.diagram!(@editor, foreign.id) }
    assert_raises(AccessPolicy::NotFound) { AccessPolicy.editable_diagram!(@editor, foreign.id) }
    assert_raises(AccessPolicy::NotFound) { AccessPolicy.membership!(@editor, @other.id) }
    assert_not AccessPolicy.can_edit?(@editor, foreign)
  end
end
