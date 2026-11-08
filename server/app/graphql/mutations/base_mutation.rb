module Mutations
  class BaseMutation < GraphQL::Schema::Mutation
    include AccessGuards

    field :errors, [Types::UserErrorType], null: false

    private

    def respond(result, key)
      { key => result.record, errors: result.errors }
    end
  end
end
