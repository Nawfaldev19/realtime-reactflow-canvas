# Request-scoped state. Rails resets these attributes after every request and job.
class Current < ActiveSupport::CurrentAttributes
  attribute :request_id, :remote_ip, :member
end
