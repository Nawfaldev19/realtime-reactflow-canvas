require "test_helper"

class CollaborationMutationTest < ActionDispatch::IntegrationTest
  include GraphqlHelpers
  include ActionCable::TestHelper

  SET = <<~GQL.freeze
    mutation($id: ID!, $enabled: Boolean!) {
      setCollaboration(id: $id, enabled: $enabled) { diagram { collaborationEnabled } errors { message } }
    }
  GQL

  setup do
    @workspace = create_workspace
    @owner = add_member(@workspace, create_member(name: "Ada Okafor"), role: "owner")
    @editor = add_member(@workspace, role: "editor")
    @diagram = create_diagram(@workspace)
  end

  def set(enabled, as: @owner) = graphql(SET, variables: { id: @diagram.id, enabled: enabled }, as: as)

  test "new diagrams collaborate live, and the diagram says so" do
    body = graphql("query($id: ID!) { diagram(id: $id) { collaborationEnabled } }", variables: { id: @diagram.id }, as: @editor)

    assert body.dig("data", "diagram", "collaborationEnabled")
  end

  test "an owner turns collaboration off and every open editor is told who did it" do
    assert_broadcast_on(DiagramChannel.room(@diagram.id), type: "collaboration", enabled: false, by: "Ada Okafor") do
      body = set(false).dig("data", "setCollaboration")

      assert_empty body["errors"]
      assert_not body.dig("diagram", "collaborationEnabled")
    end
    assert_not @diagram.reload.collaboration_enabled
  end

  test "editors cannot change the switch" do
    body = set(false, as: @editor)

    assert_equal ["FORBIDDEN"], error_codes(body)
    assert @diagram.reload.collaboration_enabled
    assert_no_broadcasts DiagramChannel.room(@diagram.id)
  end
end
