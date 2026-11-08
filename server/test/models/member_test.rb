require "test_helper"

class MemberTest < ActiveSupport::TestCase
  test "normalizes email and derives initials from the first two names" do
    member = Member.create!(name: "Ada Okafor Lee", email: "  ADA@Example.com ")

    assert_equal "ada@example.com", member.email
    assert_equal "AO", member.initials
  end

  test "requires a unique, well-formed email" do
    Member.create!(name: "Ben", email: "ben@example.com")

    assert_not_predicate Member.new(name: "Ben Again", email: "BEN@example.com"), :valid?
    assert_not_predicate Member.new(name: "Nobody", email: "not-an-email"), :valid?
  end

  test "finds its membership in a workspace by id, as integer or string" do
    workspace = create_workspace
    member = add_member(workspace, role: "viewer")

    assert_predicate member.membership_in(workspace.id), :viewer?
    assert_predicate member.membership_in(workspace.id.to_s), :viewer?
    assert_nil member.membership_in(create_workspace.id)
  end

  test "a navigation mode is optional and must be pan or scroll" do
    member = create_member

    assert_nil member.navigation_mode
    assert_predicate member.tap { |m| m.navigation_mode = "scroll" }, :valid?
    assert_not_predicate member.tap { |m| m.navigation_mode = "drift" }, :valid?
  end
end
