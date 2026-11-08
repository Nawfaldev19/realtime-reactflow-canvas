module GraphqlHelpers
  def graphql(query, variables: {}, as: nil, token: nil)
    token ||= AuthToken.issue(as) if as
    headers = { "Content-Type" => "application/json" }
    headers["Authorization"] = "Bearer #{token}" if token
    post "/graphql", params: { query: query, variables: variables }.to_json, headers: headers

    assert_response :ok
    response.parsed_body
  end

  def error_codes(body)
    Array(body["errors"]).map { |error| error.dig("extensions", "code") }
  end
end
