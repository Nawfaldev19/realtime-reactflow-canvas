require "test_helper"

class ViewMutationsTest < ActionDispatch::IntegrationTest
  include GraphqlHelpers

  UPDATE = <<~GQL.freeze
    mutation($id: ID!, $settings: JSON!) {
      updateViewSettings(id: $id, viewSettings: $settings) {
        diagram { revision viewSettings }
        errors { field message }
      }
    }
  GQL

  SET_MODE = <<~GQL.freeze
    mutation($mode: NavigationModeEnum) {
      setNavigationMode(mode: $mode) { viewer { navigationMode } errors { message } }
    }
  GQL

  SET_WORKSPACE_MODE = <<~GQL.freeze
    mutation($id: ID!, $mode: NavigationModeEnum!) {
      setWorkspaceNavigationMode(workspaceId: $id, mode: $mode) { workspace { navigationMode } errors { message } }
    }
  GQL

  setup do
    @workspace = create_workspace
    @owner = add_member(@workspace, create_member(name: "Ada Okafor"), role: "owner")
    @editor = add_member(@workspace, create_member(name: "Ben Lindqvist"), role: "editor")
    @viewer = add_member(@workspace, role: "viewer")
    @diagram = create_diagram(@workspace)
    opening = { "mode" => "saved", "savedViewport" => { "x" => 12, "y" => -30, "zoom" => 0.75 } }
    @saved = ViewSettings.defaults.deep_merge("openingView" => opening, "snapping" => { "enabled" => false, "nearest" => 4 })
  end

  def update(settings, as: @editor)
    graphql(UPDATE, variables: { id: @diagram.id, settings: settings }, as: as)
  end

  test "updateViewSettings stores the settings without changing the revision" do
    body = update(@saved).dig("data", "updateViewSettings")

    assert_empty body["errors"]
    assert_equal [0, @saved], [body.dig("diagram", "revision"), body.dig("diagram", "viewSettings")]
    assert_equal 4, @diagram.reload.view_settings.dig("snapping", "nearest")
  end

  test "updateViewSettings reports invalid settings as field errors" do
    body = update(@saved.merge("animateOnOpen" => "sometimes")).dig("data", "updateViewSettings")

    assert_nil body["diagram"]
    assert_equal "view_settings", body.dig("errors", 0, "field")
    assert_match(/animateOnOpen/, body.dig("errors", 0, "message"))
  end

  test "viewers cannot change the view settings, and other workspaces cannot see them" do
    assert_equal ["FORBIDDEN"], error_codes(update(@saved, as: @viewer))
    stranger = add_member(create_workspace(name: "Elsewhere"))

    assert_equal ["NOT_FOUND"], error_codes(update(@saved, as: stranger))
    assert_equal "fitWidth", @diagram.reload.view_settings.dig("openingView", "mode")
  end

  test "a member chooses a navigation mode and can clear it" do
    assert_equal "SCROLL",
                 graphql(SET_MODE, variables: { mode: "SCROLL" }, as: @viewer).dig("data", "setNavigationMode", "viewer", "navigationMode")
    assert_equal "scroll", @viewer.reload.navigation_mode
    assert_nil graphql(SET_MODE, variables: { mode: nil }, as: @viewer).dig("data", "setNavigationMode", "viewer", "navigationMode")
    assert_nil @viewer.reload.navigation_mode
  end

  test "the viewer and workspaces expose the navigation modes" do
    @editor.update!(navigation_mode: "scroll")
    body = graphql("{ viewer { navigationMode } workspaces { navigationMode } }", as: @editor)

    assert_equal "SCROLL", body.dig("data", "viewer", "navigationMode")
    assert_equal ["PAN"], body.dig("data", "workspaces").pluck("navigationMode")
  end

  test "only owners set the workspace default" do
    body = graphql(SET_WORKSPACE_MODE, variables: { id: @workspace.id, mode: "SCROLL" }, as: @owner)

    assert_equal "SCROLL", body.dig("data", "setWorkspaceNavigationMode", "workspace", "navigationMode")
    assert_equal ["FORBIDDEN"], error_codes(graphql(SET_WORKSPACE_MODE, variables: { id: @workspace.id, mode: "PAN" }, as: @editor))
    assert_equal "scroll", @workspace.reload.navigation_mode
  end

  test "signed-out requests cannot change modes" do
    assert_equal ["UNAUTHENTICATED"], error_codes(graphql(SET_MODE, variables: { mode: "PAN" }))
  end
end
