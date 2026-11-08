Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*Rails.application.config.cors_allowed_origins)
    resource "/graphql", headers: %w[Authorization Content-Type], methods: %i[post options]
  end
end
