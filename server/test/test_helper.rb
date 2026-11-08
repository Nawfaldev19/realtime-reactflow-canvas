ENV["RAILS_ENV"] ||= "test"

require "simplecov"
SimpleCov.start "rails" do
  enable_coverage :branch
  skip %w[/vendor/ /test/ /config/ /db/]
  minimum_coverage line: 95, branch: 85
end

require_relative "../config/environment"
require "rails/test_help"
require_relative "support/test_data"
require_relative "support/graphql_helpers"

# `bin/rails db:prepare` seeds a database it has just created, so a fresh test
# database starts with the demo workspaces. Tests expect to own every row.
[DiagramOperation, DiagramVersion, Diagram, Membership, Member, Workspace].each(&:delete_all)

module ActiveSupport
  class TestCase
    include TestData
    include ActiveSupport::Testing::TimeHelpers

    # The sign-in throttle counts per process; every test starts with fresh counts.
    setup { Mutations::SignInAsDemo::THROTTLE.reset! }
  end
end
