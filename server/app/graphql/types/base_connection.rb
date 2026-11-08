module Types
  # Non-null edges and nodes: an item in a page is never null, so clients do not
  # need to filter nulls out of every list.
  class BaseConnection < GraphQL::Types::Relay::BaseConnection
    edges_nullable(false)
    edge_nullable(false)
    node_nullable(false)
  end
end
