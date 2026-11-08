require "test_helper"

class MembershipTest < ActiveSupport::TestCase
  test "owners and editors can edit, viewers cannot" do
    workspace = create_workspace

    assert_predicate Membership.new(workspace: workspace, member: create_member, role: "owner"), :can_edit?
    assert_predicate Membership.new(workspace: workspace, member: create_member, role: "editor"), :can_edit?
    assert_not_predicate Membership.new(workspace: workspace, member: create_member, role: "viewer"), :can_edit?
  end

  test "rejects unknown roles and duplicate memberships" do
    workspace = create_workspace
    member = add_member(workspace)

    assert_not_predicate Membership.new(workspace: workspace, member: create_member, role: "admin"), :valid?
    assert_not_predicate Membership.new(workspace: workspace, member: member, role: "viewer"), :valid?
  end
end
