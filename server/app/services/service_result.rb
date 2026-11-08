# Outcome of a write operation. `errors` holds user-facing problems, each a hash
# with :field (nil for whole-record problems), :message and an optional :code.
ServiceResult = Data.define(:record, :errors) do
  def self.success(record) = new(record: record, errors: [])
  def self.failure(errors, record: nil) = new(record: record, errors: errors)

  def self.from_model_errors(model)
    failure(model.errors.map { |error| { field: error.attribute == :base ? nil : error.attribute.to_s, message: error.full_message } })
  end

  def success? = errors.empty?
end
