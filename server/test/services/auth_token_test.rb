require "test_helper"

class AuthTokenTest < ActiveSupport::TestCase
  test "a fresh token authenticates its member" do
    member = create_member

    assert_equal member, AuthToken.authenticate(AuthToken.issue(member))
  end

  test "expired, tampered, blank and wrong-purpose tokens are rejected" do
    member = create_member
    token = AuthToken.issue(member)
    other_purpose = AuthToken.verifier.generate(member.id, purpose: :something_else)

    travel(AuthToken::LIFETIME + 1.second) { assert_nil AuthToken.authenticate(token) }
    assert_nil AuthToken.authenticate("#{token}x")
    assert_nil AuthToken.authenticate("")
    assert_nil AuthToken.authenticate(other_purpose)
  end

  test "a token for a deleted member no longer authenticates" do
    member = create_member
    token = AuthToken.issue(member)
    member.destroy!

    assert_nil AuthToken.authenticate(token)
  end
end
