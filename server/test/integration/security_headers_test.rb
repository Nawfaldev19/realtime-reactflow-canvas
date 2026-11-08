require "test_helper"

class SecurityHeadersTest < ActionDispatch::IntegrationTest
  include GraphqlHelpers

  EXPECTED = {
    "Content-Security-Policy" => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "X-Content-Type-Options" => "nosniff",
    "X-Frame-Options" => "DENY",
    "Referrer-Policy" => "no-referrer"
  }.freeze

  test "API responses forbid framing, sniffing and loading anything" do
    graphql("{ viewer { id } }")

    EXPECTED.each { |name, value| assert_equal value, response.headers[name], name }
  end

  test "the status endpoint and error responses carry the same headers" do
    get "/up"

    EXPECTED.each { |name, value| assert_equal value, response.headers[name], name }

    post "/graphql", params: "{not json", headers: { "Content-Type" => "application/json" }

    assert_response :bad_request
    assert_equal "nosniff", response.headers["X-Content-Type-Options"]
  end
end
