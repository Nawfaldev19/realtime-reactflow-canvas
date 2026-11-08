# Signed, expiring bearer tokens. The payload is the member id; the HMAC
# signature, purpose and expiry are checked by ActiveSupport::MessageVerifier,
# keyed from secret_key_base. The same token will authorize the ActionCable
# connection, passed as a query parameter because browsers cannot set headers
# on a WebSocket handshake.
module AuthToken
  PURPOSE = :canvas_session
  LIFETIME = 12.hours

  def self.issue(member, expires_in: LIFETIME)
    verifier.generate(member.id, purpose: PURPOSE, expires_in: expires_in)
  end

  # Returns the member, or nil for a missing, tampered, or expired token.
  def self.authenticate(token)
    return nil if token.blank?

    member_id = verifier.verified(token, purpose: PURPOSE)
    member_id && Member.find_by(id: member_id)
  end

  def self.verifier
    Rails.application.message_verifier(:canvas_auth_token)
  end
end
