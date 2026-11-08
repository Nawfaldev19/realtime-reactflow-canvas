require "test_helper"

class VersionCaptureTest < ActiveSupport::TestCase
  include ActionCable::TestHelper

  setup do
    @workspace = create_workspace
    @ada = add_member(@workspace, create_member(name: "Ada Okafor"))
    @ben = add_member(@workspace, create_member(name: "Ben Lindqvist"))
    @diagram = create_diagram(@workspace, author: @ada)
    DiagramVersion.capture!(@diagram, author: @ada, kind: "created", label: "Created")
  end

  def capture(kind, member: @ada, label: nil) = VersionCapture.call(diagram: @diagram, member: member, kind: kind, label: label)

  def edit!(text)
    document = @diagram.document.deep_dup
    document["nodes"][1]["data"]["text"] = text
    @diagram.update!(document: document, revision: @diagram.revision + 1)
  end

  test "a manual version is always made, numbered after the last, with a trimmed label" do
    outcome = capture("manual", label: "  Legs glued  ")

    assert outcome.created
    assert_equal [2, "manual", "Legs glued", @ada],
                 [outcome.version.number, outcome.version.kind, outcome.version.label, outcome.version.author]
    assert_predicate capture("manual"), :created
    assert_equal [3, 2, 1], @diagram.versions.newest_first.pluck(:number)
  end

  test "an automatic version is skipped while nothing changed since the latest version" do
    travel 11.minutes do
      outcome = capture("automatic")

      assert_not outcome.created
      assert_equal 1, outcome.version.number
    end
  end

  test "an automatic version is skipped when a collaborator took one in the last five minutes" do
    start = Time.current
    travel_to start + 11.minutes
    edit!("Cut the legs")

    assert_predicate capture("automatic", member: @ben), :created
    edit!("Cut the legs to 70 cm")
    travel_to start + 15.minutes

    assert_not capture("automatic").created
    travel_to start + 17.minutes

    assert_predicate capture("automatic"), :created
    assert_equal %w[automatic automatic created], @diagram.versions.newest_first.pluck(:kind)
  end

  test "a restore checkpoint is skipped only when nothing changed" do
    assert_not capture("restore").created
    edit!("Sand the top")

    assert_predicate capture("restore", label: "Before restoring v1"), :created
  end

  test "every new version is announced to the diagram's room, skipped ones are not" do
    assert_broadcast_on(DiagramChannel.room(@diagram.id), type: "versions", number: 2, by: "Ada Okafor") do
      capture("manual")
    end
    assert_no_broadcasts(DiagramChannel.room(@diagram.id)) { capture("restore") }
  end

  test "a label longer than 80 characters is a field error" do
    outcome = capture("manual", label: "x" * 81)

    assert_not outcome.created
    assert_equal ["label"], outcome.errors.pluck(:field)
    assert_equal 1, @diagram.versions.count
  end
end
