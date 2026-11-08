Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = ENV["CI"].present?
  config.consider_all_requests_local = true
  config.action_dispatch.show_exceptions = :rescuable
  config.active_support.deprecation = :stderr
  config.logger = ActiveSupport::Logger.new(Rails.root.join("log/test.log")).tap { |logger| logger.formatter = JsonLogFormatter.new }
  config.log_level = :info
end
