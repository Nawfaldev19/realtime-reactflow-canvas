require "test_helper"

class AuthenticationTest < ActionDispatch::IntegrationTest
  include GraphqlHelpers

  SIGN_IN = <<~GQL.freeze
    mutation($memberId: ID!) { signInAsDemo(memberId: $memberId) { token viewer { name initials } errors { field message } } }
  GQL

  SIGN_IN_CODES = <<~GQL.freeze
    mutation($memberId: ID!) { signInAsDemo(memberId: $memberId) { token errors { code message } } }
  GQL

  test "the sign-in picker lists demo members with their roles, without signing in" do
    workspace = create_workspace(name: "Riverside Makers")
    add_member(workspace, create_member(name: "Ada Okafor"), role: "owner")
    body = graphql("{ demoMembers { name initials summary } }")

    assert_equal [{ "name" => "Ada Okafor", "initials" => "AO", "summary" => "Owner at Riverside Makers" }], body.dig("data", "demoMembers")
  end

  test "picking a person returns a token that authenticates later requests" do
    member = create_member(name: "Ben Lindqvist")
    payload = graphql(SIGN_IN, variables: { memberId: member.id }).dig("data", "signInAsDemo")

    assert_equal({ "name" => "Ben Lindqvist", "initials" => "BL" }, payload["viewer"])
    assert_equal "Ben Lindqvist", graphql("{ viewer { name } }", token: payload["token"]).dig("data", "viewer", "name")
  end

  test "an unknown person gets a field error and no token" do
    payload = graphql(SIGN_IN, variables: { memberId: "999999" }).dig("data", "signInAsDemo")

    assert_nil payload["token"]
    assert_equal "memberId", payload.dig("errors", 0, "field")
  end

  test "viewer is null without a token and protected fields require one" do
    assert_nil graphql("{ viewer { id } }").dig("data", "viewer")
    assert_equal ["UNAUTHENTICATED"], error_codes(graphql("{ workspaces { id } }"))
    assert_equal ["UNAUTHENTICATED"], error_codes(graphql("{ workspaces { id } }", token: "forged.token"))
  end

  test "an expired token is treated as signed out" do
    token = AuthToken.issue(create_member)

    travel(AuthToken::LIFETIME + 1.minute) do
      assert_equal ["UNAUTHENTICATED"], error_codes(graphql("{ workspaces { id } }", token: token))
    end
  end

  test "sign-ins are limited per client address per minute" do
    member = create_member
    limit = Mutations::SignInAsDemo::THROTTLE.limit

    limit.times { assert graphql(SIGN_IN_CODES, variables: { memberId: member.id }).dig("data", "signInAsDemo", "token") }

    refused = graphql(SIGN_IN_CODES, variables: { memberId: member.id }).dig("data", "signInAsDemo")

    assert_nil refused["token"]
    assert_equal "RATE_LIMITED", refused.dig("errors", 0, "code")

    post "/graphql", params: { query: SIGN_IN_CODES, variables: { memberId: member.id } }.to_json,
                     headers: { "Content-Type" => "application/json", "REMOTE_ADDR" => "192.0.2.7" }

    assert response.parsed_body.dig("data", "signInAsDemo", "token"), "another address has its own count"
  end
end
