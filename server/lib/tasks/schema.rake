namespace :graphql do
  desc "Write the GraphQL schema (SDL) to schema.graphql for client code generation"
  task dump_schema: :environment do
    path = Rails.root.join("schema.graphql")
    File.write(path, "#{CanvasSchema.to_definition.strip}\n")
    puts "Wrote #{path.relative_path_from(Rails.root)}"
  end
end
