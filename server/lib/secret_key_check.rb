# Production refuses to boot without a real secret: every session and resume
# token is signed with it, so a missing, short or copied placeholder value
# would make them forgeable.
module SecretKeyCheck
  # 40 characters accepts a 256-bit random value in base64 (44 characters), which is what
  # Render's generateValue produces; `bin/rails secret` (128 hex characters) also passes.
  MIN_LENGTH = 40
  # The value shipped in .env.example.
  PLACEHOLDER = "replace-me".freeze

  class Error < StandardError; end

  module_function

  # The problem with `value` as a production secret, or nil when it is usable.
  def problem(value)
    return "SECRET_KEY_BASE is not set" if value.nil? || value.strip.empty?
    return "SECRET_KEY_BASE is the .env.example placeholder" if value == PLACEHOLDER
    return "SECRET_KEY_BASE must be at least #{MIN_LENGTH} characters (generate one with bin/rails secret)" if value.length < MIN_LENGTH

    nil
  end

  def verify!(value)
    message = problem(value)
    raise Error, message if message

    value
  end
end
