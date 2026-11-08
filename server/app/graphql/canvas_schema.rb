class CanvasSchema < GraphQL::Schema
  query Types::QueryType
  mutation Types::MutationType

  use GraphQL::Dataloader

  max_depth 10
  max_complexity 500

  rescue_from(AccessPolicy::NotFound) { raise GraphqlErrors.not_found }
  rescue_from(AccessPolicy::Forbidden) { raise GraphqlErrors.forbidden }
  rescue_from(VersionPage::InvalidCursor) { raise GraphqlErrors.invalid_argument("The page cursor is not valid") }
end
