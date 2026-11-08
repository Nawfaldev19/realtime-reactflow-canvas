class ApplicationController < ActionController::API
  rescue_from JSON::ParserError, ActionController::BadRequest do
    render json: { errors: [{ message: "Malformed request body", extensions: { code: "BAD_REQUEST" } }] }, status: :bad_request
  end
end
