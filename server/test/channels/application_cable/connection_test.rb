require "test_helper"

module ApplicationCable
  class ConnectionTest < ActionCable::Connection::TestCase
    setup { @member = create_member(name: "Ada Okafor") }

    test "a valid session token identifies the member" do
      connect params: { token: AuthToken.issue(@member) }

      assert_equal @member, connection.current_member
    end

    test "a socket without a token is refused" do
      assert_reject_connection { connect }
    end

    test "a tampered or expired token is refused" do
      assert_reject_connection { connect params: { token: "#{AuthToken.issue(@member)}x" } }
      expired = AuthToken.issue(@member, expires_in: 1.minute)

      travel 2.minutes do
        assert_reject_connection { connect params: { token: expired } }
      end
    end
  end
end
