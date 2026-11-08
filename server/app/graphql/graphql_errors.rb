# Top-level GraphQL errors carry a machine-readable `extensions.code` so the
# client can react (for example, sign the member out on UNAUTHENTICATED).
module GraphqlErrors
  module_function

  def build(message, code)
    GraphQL::ExecutionError.new(message, extensions: { "code" => code })
  end

  def unauthenticated = build("Sign in to continue", "UNAUTHENTICATED")
  def forbidden = build("Your role in this workspace does not allow that", "FORBIDDEN")
  def not_found = build("Not found", "NOT_FOUND")
  def invalid_argument(message) = build(message, "INVALID_ARGUMENT")
end
