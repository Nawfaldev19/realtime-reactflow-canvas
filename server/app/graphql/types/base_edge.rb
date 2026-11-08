module Types
  class BaseEdge < GraphQL::Types::Relay::BaseEdge
    node_nullable(false)
  end
end
