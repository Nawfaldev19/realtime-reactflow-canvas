module ApplicationCable
  # A socket is opened only with a valid, unexpired session token (the same
  # signed token as the GraphQL API, passed as a query parameter because
  # browsers cannot set headers on a WebSocket handshake). Without one the
  # handshake is refused before any channel can be joined.
  class Connection < ActionCable::Connection::Base
    identified_by :current_member

    def connect
      self.current_member = AuthToken.authenticate(request.params[:token]) || reject_unauthorized_connection
    end
  end
end
