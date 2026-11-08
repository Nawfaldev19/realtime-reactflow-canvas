# Emits one JSON object per log line so logs can be parsed by any aggregator.
# Hash messages are merged into the payload as structured fields.
class JsonLogFormatter < Logger::Formatter
  def call(severity, time, _progname, message)
    payload = { time: time.utc.iso8601(3), level: severity, request_id: (Current.request_id if defined?(Current)) }
    payload.merge!(if message.is_a?(Hash)
                     message
                   else
                     { message: message.is_a?(String) ? message.strip : message.inspect }
                   end)
    "#{payload.compact.to_json}\n"
  end
end
