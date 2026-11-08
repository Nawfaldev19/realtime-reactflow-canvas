module Mutations
  class SignInAsDemo < BaseMutation
    description "Demo sign-in: pick a person and receive a signed, expiring bearer token"

    # Sign-ins per client address per minute (docs/SECURITY.md). The
    # end-to-end suite raises it, because every test signs in from one address.
    THROTTLE = Throttle.new(limit: Integer(ENV.fetch("SIGN_IN_LIMIT_PER_MINUTE", "20")), period: 60)

    argument :member_id, ID

    field :token, String
    field :viewer, Types::ViewerType

    def resolve(member_id:)
      return rate_limited unless THROTTLE.allow?(Current.remote_ip.to_s)

      member = Member.find_by(id: member_id)
      return { token: nil, viewer: nil, errors: [{ field: "memberId", message: "Choose a person from the list" }] } unless member

      { token: AuthToken.issue(member), viewer: member, errors: [] }
    end

    private

    def rate_limited
      { token: nil, viewer: nil,
        errors: [{ field: nil, code: "RATE_LIMITED", message: "Too many sign-in attempts. Wait a minute and try again." }] }
    end
  end
end
