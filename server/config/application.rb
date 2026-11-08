require_relative "boot"

require "rails"
require "active_model/railtie"
require "active_record/railtie"
require "action_controller/railtie"
require "action_cable/engine"
# GlobalID names a socket by its member, so Membership can disconnect that member's sockets.
require "global_id/railtie"
require "rails/test_unit/railtie"

Bundler.require(*Rails.groups)

require_relative "../lib/json_log_formatter"

module LiveCanvas
  class Application < Rails::Application
    config.load_defaults 8.0
    config.api_only = true
    config.autoload_lib(ignore: %w[tasks json_log_formatter.rb secret_key_check.rb])
    config.time_zone = "UTC"

    # Structured JSON logs. The formatter reads the request id from Current.
    config.logger = ActiveSupport::Logger.new($stdout).tap { |logger| logger.formatter = JsonLogFormatter.new }
    config.log_level = ENV.fetch("LOG_LEVEL", "info")
    config.colorize_logging = false

    # Security headers on every response (docs/SECURITY.md). The API only
    # returns JSON, so its content security policy allows nothing to load and
    # nothing to frame it; the web app's own policy is in client/securityHeaders.ts.
    config.action_dispatch.default_headers = {
      "Content-Security-Policy" => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "X-Content-Type-Options" => "nosniff",
      "X-Frame-Options" => "DENY",
      "Referrer-Policy" => "no-referrer",
      "X-Permitted-Cross-Domain-Policies" => "none"
    }

    config.cors_allowed_origins = ENV.fetch("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")

    # Real-time collaboration (docs/features/collaboration.md). The socket is authorized
    # by the same signed token as GraphQL, so only the web app's origins may open it.
    config.action_cable.mount_path = "/cable"
    config.action_cable.allowed_request_origins = config.cors_allowed_origins
  end
end
