require "test_helper"

class ThrottleTest < ActiveSupport::TestCase
  setup do
    @now = 100.0
    @throttle = Throttle.new(limit: 3, period: 60, clock: -> { @now })
  end

  test "allows the limit within one window and refuses the rest" do
    assert_equal [true, true, true, false, false], Array.new(5) { @throttle.allow?("a") }
  end

  test "counts each key separately" do
    3.times { @throttle.allow?("a") }

    assert @throttle.allow?("b")
    assert_not @throttle.allow?("a")
  end

  test "a new window starts once the period has passed" do
    4.times { @throttle.allow?("a") }
    @now += 59.9

    assert_not @throttle.allow?("a")

    @now += 0.1

    assert @throttle.allow?("a")
  end

  test "reset forgets every count" do
    4.times { @throttle.allow?("a") }
    @throttle.reset!

    assert @throttle.allow?("a")
  end

  test "expired windows are pruned once many keys are tracked" do
    Throttle::PRUNE_AT.times { |i| @throttle.allow?(i) }
    @now += 61
    @throttle.allow?("fresh")

    assert_equal 1, @throttle.size
  end

  test "concurrent callers never exceed the limit" do
    throttle = Throttle.new(limit: 50, period: 60)
    allowed = Array.new(8) { Thread.new { Array.new(20) { throttle.allow?("shared") }.count(true) } }.sum(&:value)

    assert_equal 50, allowed
  end
end
