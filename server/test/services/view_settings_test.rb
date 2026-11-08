require "test_helper"

class ViewSettingsTest < ActiveSupport::TestCase
  def with(changes)
    ViewSettings.defaults.deep_merge(changes)
  end

  test "defaults are valid, open fit-to-width and snap to the two nearest steps" do
    assert_empty ViewSettings.validate(ViewSettings.defaults)
    assert_equal "fitWidth", ViewSettings.defaults.dig("openingView", "mode")
    assert_equal({ "enabled" => true, "nearest" => 2 }, ViewSettings.defaults["snapping"])
  end

  test "accepts a saved viewport" do
    assert_empty ViewSettings.validate(with("openingView" => { "mode" => "saved",
                                                               "savedViewport" => { "x" => 10, "y" => -4.5, "zoom" => 0.8 } }))
  end

  test "a saved view needs a viewport" do
    assert_equal ["openingView.savedViewport is required for a saved view"],
                 ViewSettings.validate(with("openingView" => { "mode" => "saved" }))
  end

  test "rejects unknown modes, out-of-range values and bad viewports" do
    settings = with(
      "openingView" => { "mode" => "zoomy", "customPercent" => 500, "savedViewport" => { "x" => 1, "y" => 1, "zoom" => 0 } },
      "background" => { "pattern" => "plaid", "gap" => 1 },
      "animateOnOpen" => "yes"
    )

    assert_equal 6, ViewSettings.validate(settings).size
  end

  test "rejects viewports outside the zoom limits or far away" do
    [{ "x" => 0, "y" => 0, "zoom" => 2.5 }, { "x" => 2_000_000, "y" => 0, "zoom" => 1 }, { "x" => "1", "y" => 0, "zoom" => 1 },
     { "x" => Float::NAN, "y" => 0, "zoom" => 1 }, [1, 2, 3]].each do |viewport|
      assert_equal 1, ViewSettings.validate(with("openingView" => { "savedViewport" => viewport })).size, viewport.inspect
    end
  end

  test "snapping is optional but checked when present" do
    assert_empty ViewSettings.validate(ViewSettings.defaults.except("snapping"))
    assert_empty ViewSettings.validate(with("snapping" => { "enabled" => false, "nearest" => 10 }))
    assert_equal ["snapping must be an object"], ViewSettings.validate(with("snapping" => true))
    assert_equal ["snapping.enabled must be true or false", "snapping.nearest must be a whole number from 1 to 10"],
                 ViewSettings.validate(with("snapping" => { "enabled" => 1, "nearest" => 11 }))
    assert_equal 1, ViewSettings.validate(with("snapping" => { "nearest" => 2.5 })).size
  end

  test "rejects unknown keys" do
    assert_equal ["unknown keys: theme"], ViewSettings.validate(with("theme" => "dark"))
  end

  test "rejects missing sections" do
    assert_equal ["must be an object"], ViewSettings.validate(nil)
    assert_equal ["openingView must be an object", "background must be an object", "animateOnOpen must be true or false"],
                 ViewSettings.validate({})
  end
end
