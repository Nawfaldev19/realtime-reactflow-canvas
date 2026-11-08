require "test_helper"

class DiagramSaveTest < ActiveSupport::TestCase
  setup do
    @workspace = create_workspace
    @member = add_member(@workspace)
    @diagram = create_diagram(@workspace, collaboration: false)
    @document = document_with(nodes: [node_hash("only")])
  end

  def save(base_revision:, document: @document, view_settings: nil)
    DiagramSave.call(diagram: Diagram.find(@diagram.id), member: @member, base_revision: base_revision, document: document,
                     view_settings: view_settings)
  end

  test "a save on the current revision stores the document and increments the revision" do
    result = save(base_revision: 0)

    assert_predicate result, :success?
    assert_equal 1, @diagram.reload.revision
    assert_equal @document, @diagram.document
    assert_equal @member, @diagram.updated_by
  end

  test "a stale save is rejected with a conflict and returns the stored diagram" do
    save(base_revision: 0)
    result = save(base_revision: 0, document: DiagramDocument.empty)

    assert_not_predicate result, :success?
    assert_equal DiagramSave::CONFLICT, result.errors.first[:code]
    assert_equal 1, result.record.revision
    assert_equal @document, @diagram.reload.document
  end

  test "view settings are replaced only when given" do
    settings = ViewSettings.defaults.merge("animateOnOpen" => true)
    save(base_revision: 0, view_settings: settings)

    assert(@diagram.reload.view_settings["animateOnOpen"])

    save(base_revision: 1)

    assert(@diagram.reload.view_settings["animateOnOpen"])
  end

  test "an invalid document is rejected without changing the revision" do
    result = save(base_revision: 0, document: { "nodes" => [] })

    assert_not_predicate result, :success?
    assert_equal "document", result.errors.first[:field]
    assert_equal 0, @diagram.reload.revision
  end

  test "a whole-document save is refused while live collaboration is on" do
    @diagram.update!(collaboration_enabled: true)
    result = save(base_revision: 0)

    assert_equal DiagramSave::COLLABORATING, result.errors.first[:code]
    assert_equal 0, @diagram.reload.revision
  end
end
