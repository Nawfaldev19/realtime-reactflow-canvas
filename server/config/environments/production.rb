require_relative "../../lib/secret_key_check"

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false
  config.force_ssl = ENV["FORCE_SSL"] == "true"
  config.active_record.dump_schema_after_migration = false
  config.active_support.report_deprecations = false
  config.secret_key_base = SecretKeyCheck.verify!(ENV.fetch("SECRET_KEY_BASE", nil))
end
