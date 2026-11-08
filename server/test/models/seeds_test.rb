require "test_helper"

class SeedsTest < ActiveSupport::TestCase
  test "seeds two workspaces, five members and three valid plans per workspace, repeatably" do
    2.times { capture_io { load Rails.root.join("db/seeds.rb") } }

    assert_equal [2, 5, 6, 6], [Workspace.count, Member.count, Diagram.count, DiagramVersion.count]
    Workspace.find_each { |workspace| assert_equal 3, workspace.diagrams.count }
    Diagram.find_each do |diagram|
      assert_empty DiagramDocument.validate(diagram.document)
      assert_operator diagram.document["nodes"].count { |node| node["kind"] == "note" }, :>=, 2
      assert_empty ViewSettings.validate(diagram.view_settings)
    end
    assert_equal ["Build a walnut side table"], Diagram.all.select { |diagram| diagram.view_settings["animateOnOpen"] }.map(&:title)
  end
end
