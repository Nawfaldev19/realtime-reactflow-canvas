# Tenant isolation and roles in one place. Every resolver (and, later, the
# collaboration channel) loads workspaces and diagrams through these methods
# instead of calling Model.find, so a member can never reach another
# workspace's data. A record outside the member's workspaces is reported as
# not found, which does not reveal whether the id exists.
module AccessPolicy
  class NotFound < StandardError; end
  class Forbidden < StandardError; end

  module_function

  def membership!(member, workspace_id)
    member.membership_in(workspace_id) || raise(NotFound)
  end

  def editable_membership!(member, workspace_id)
    membership = membership!(member, workspace_id)
    raise Forbidden unless membership.can_edit?

    membership
  end

  def diagram!(member, diagram_id)
    Diagram.visible_to(member).find_by(id: diagram_id) || raise(NotFound)
  end

  def editable_diagram!(member, diagram_id)
    diagram = diagram!(member, diagram_id)
    raise Forbidden unless can_edit?(member, diagram)

    diagram
  end

  def owned_diagram!(member, diagram_id)
    diagram = diagram!(member, diagram_id)
    raise Forbidden unless member.membership_in(diagram.workspace_id).owner?

    diagram
  end

  # A version is reached through its diagram, so the same workspace rule applies.
  def version!(member, version_id)
    DiagramVersion.where(diagram_id: Diagram.visible_to(member).select(:id)).find_by(id: version_id) || raise(NotFound)
  end

  def writable_version!(member, version_id)
    version = version!(member, version_id)
    raise Forbidden unless can_edit?(member, version.diagram)

    version
  end

  # Several versions at once (compare): every id is checked, and one id the
  # member cannot see makes the whole request not found.
  def versions!(member, version_ids)
    ids = version_ids.map(&:to_s).uniq
    found = DiagramVersion.where(diagram_id: Diagram.visible_to(member).select(:id)).where(id: ids).index_by { |version| version.id.to_s }
    raise NotFound unless found.size == ids.size

    ids.map { |id| found.fetch(id) }
  end

  def can_edit?(member, diagram)
    member.membership_in(diagram.workspace_id)&.can_edit? || false
  end
end
