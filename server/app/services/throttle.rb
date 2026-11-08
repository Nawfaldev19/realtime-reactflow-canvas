# A fixed-window request counter: at most `limit` calls of `allow?` per key in
# each `period` seconds. Counts live in this process's memory, which matches
# the single-process deployment of the demo (config/cable.yml); several
# processes would need a shared store. Tests pass in their own clock.
class Throttle
  # Expired windows are dropped once this many keys are tracked, so a stream
  # of new keys (for example many client addresses) cannot grow memory without bound.
  PRUNE_AT = 10_000

  def initialize(limit:, period:, clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) })
    @limit = limit
    @period = period
    @clock = clock
    @windows = {}
    @mutex = Mutex.new
  end

  attr_reader :limit, :period

  # Counts one call for `key` and says whether it is within the limit.
  def allow?(key)
    @mutex.synchronize do
      now = @clock.call
      prune(now) if @windows.size >= PRUNE_AT
      started, count = @windows[key]
      if started.nil? || now - started >= @period
        started = now
        count = 0
      end
      @windows[key] = [started, count + 1]
      count < @limit
    end
  end

  def reset!
    @mutex.synchronize { @windows.clear }
  end

  delegate :size, to: :@windows

  private

  def prune(now)
    @windows.delete_if { |_key, (started, _count)| now - started >= @period }
  end
end
