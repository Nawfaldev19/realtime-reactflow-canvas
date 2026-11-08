module Types
  class BaseObject < GraphQL::Schema::Object
    include AccessGuards

    field_class Types::BaseField
    edge_type_class Types::BaseEdge
    connection_type_class Types::BaseConnection
  end
end
