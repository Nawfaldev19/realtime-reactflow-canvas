# Single GraphQL endpoint. Authentication happens here, once per request,
# before any resolver runs. Workspace access is checked per record by
# AccessPolicy, so no tenant header is needed.
class GraphqlController < ApplicationController
  def execute
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    Current.request_id = request.request_id
    Current.remote_ip = request.remote_ip
    Current.member = AuthToken.authenticate(bearer_token)

    result = CanvasSchema.execute(params[:query], variables: variables_param, operation_name: params[:operationName])
    log_operation(result, started)
    render json: result
  end

  private

  def bearer_token
    request.authorization.to_s[/\ABearer (\S+)\z/, 1]
  end

  def variables_param
    raw = params[:variables]
    case raw
    when String then raw.present? ? JSON.parse(raw) : {}
    when ActionController::Parameters then raw.to_unsafe_h
    when nil then {}
    else raise ActionController::BadRequest, "variables must be an object"
    end
  end

  def log_operation(result, started)
    Rails.logger.info(
      event: "graphql.execute",
      operation: params[:operationName],
      member_id: Current.member&.id,
      error_count: result["errors"]&.size.to_i,
      duration_ms: ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(1)
    )
  end
end
