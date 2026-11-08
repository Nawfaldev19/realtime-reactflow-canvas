require "test_helper"

class RequestHandlingTest < ActionDispatch::IntegrationTest
  include GraphqlHelpers

  test "the status endpoint responds" do
    get "/up"

    assert_response :ok
    assert_equal({ "status" => "ok" }, response.parsed_body)
  end

  test "malformed JSON bodies get a 400 with a code" do
    post "/graphql", params: "{not json", headers: { "Content-Type" => "application/json" }

    assert_response :bad_request
    assert_equal "BAD_REQUEST", response.parsed_body.dig("errors", 0, "extensions", "code")
  end

  test "variables may arrive as a JSON string or be omitted" do
    post "/graphql", params: { query: "query($id: ID!) { diagram(id: $id) { id } }", variables: { id: "1" }.to_json }

    assert_equal ["UNAUTHENTICATED"], error_codes(response.parsed_body)

    post "/graphql", params: { query: "{ viewer { id } }" }

    assert_nil response.parsed_body.dig("data", "viewer")
  end

  test "variables of the wrong type are rejected" do
    post "/graphql", params: { query: "{ viewer { id } }", variables: [1] }.to_json, headers: { "Content-Type" => "application/json" }

    assert_response :bad_request
  end
end
