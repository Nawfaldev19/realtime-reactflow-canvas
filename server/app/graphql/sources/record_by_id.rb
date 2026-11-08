module Sources
  # Batches `Model.find(id)` calls made while resolving a list into one query.
  class RecordById < GraphQL::Dataloader::Source
    def initialize(model)
      super()
      @model = model
    end

    def fetch(ids)
      records = @model.where(id: ids).index_by(&:id)
      ids.map { |id| records[id] }
    end
  end
end
