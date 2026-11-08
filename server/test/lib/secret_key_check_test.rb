require "test_helper"
require "open3"
require_relative "../../lib/secret_key_check"

class SecretKeyCheckTest < ActiveSupport::TestCase
  test "a missing, blank, placeholder or short secret is refused" do
    assert_equal "SECRET_KEY_BASE is not set", SecretKeyCheck.problem(nil)
    assert_equal "SECRET_KEY_BASE is not set", SecretKeyCheck.problem("  ")
    assert_equal "SECRET_KEY_BASE is the .env.example placeholder", SecretKeyCheck.problem("replace-me")
    assert_match "at least 64 characters", SecretKeyCheck.problem("a" * 63)
    assert_raises(SecretKeyCheck::Error) { SecretKeyCheck.verify!("replace-me") }
  end

  test "a secret of 64 characters or more is accepted" do
    secret = SecureRandom.hex(64)

    assert_nil SecretKeyCheck.problem("b" * 64)
    assert_equal secret, SecretKeyCheck.verify!(secret)
  end

  test "the placeholder is the one .env.example ships" do
    example = Rails.root.join("../.env.example").read

    assert_includes example.lines.map(&:strip), "SECRET_KEY_BASE=#{SecretKeyCheck::PLACEHOLDER}"
  end

  test "production does not boot with the placeholder secret" do
    env = { "RAILS_ENV" => "production", "SECRET_KEY_BASE" => SecretKeyCheck::PLACEHOLDER, "DATABASE_PATH" => "tmp/unused.sqlite3" }
    output, status = Open3.capture2e(env, "bin/rails", "runner", "puts :booted", chdir: Rails.root.to_s)

    assert_not_predicate status, :success?
    assert_includes output, "SECRET_KEY_BASE is the .env.example placeholder"
    assert_not_includes output, "booted"
  end
end
