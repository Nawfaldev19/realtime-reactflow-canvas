# Guards shared by query resolvers and mutations.
module AccessGuards
  def require_member!
    Current.member || raise(GraphqlErrors.unauthenticated)
  end
end
