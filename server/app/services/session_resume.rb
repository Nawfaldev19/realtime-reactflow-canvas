# Signed resume tokens for collaboration sessions. DiagramChannel mints a
# session id for every subscription and hands its subscriber a token naming
# the member, the diagram and the session. A reconnecting tab sends the token
# back to keep its session (and with it the de-duplication of re-sent
# changes). The token is only ever sent to its own subscriber, and it is
# worthless to anyone else: it is checked against the member and diagram of
# the subscription presenting it.
module SessionResume
  PURPOSE = "collaboration-session".freeze
  TTL = 12.hours

  module_function

  def issue(member_id:, diagram_id:, session_id:)
    verifier.generate({ "member" => member_id, "diagram" => diagram_id, "session" => session_id }, expires_in: TTL)
  end

  # The session a token names, or nil when it is not valid for this member and diagram.
  def session_for(token, member_id:, diagram_id:)
    claim = token.is_a?(String) ? verifier.verified(token) : nil
    return unless claim.is_a?(Hash) && claim["member"] == member_id && claim["diagram"] == diagram_id

    claim["session"] if DiagramDocument::Shape.identifier?(claim["session"])
  end

  def verifier = Rails.application.message_verifier(PURPOSE)
end
