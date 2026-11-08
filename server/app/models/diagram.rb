# A diagram: a title, a JSON document of nodes and edges, a revision counter,
# and the settings for how the diagram opens. See docs/ARCHITECTURE.md.
class Diagram < ApplicationRecord
  belongs_to :workspace
  belongs_to :created_by, class_name: "Member", optional: true
  belongs_to :updated_by, class_name: "Member", optional: true
  has_many :versions, class_name: "DiagramVersion", dependent: :delete_all
  has_many :operations, class_name: "DiagramOperation", dependent: :delete_all

  attribute :document, :json, default: -> { DiagramDocument.empty }
  attribute :view_settings, :json, default: -> { ViewSettings.defaults }

  validates :title, presence: true, length: { maximum: 120 }
  validates :revision, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validate :document_is_well_formed
  validate :view_settings_are_well_formed

  before_save :count_contents, if: :document_changed?

  scope :recently_updated, -> { order(updated_at: :desc, id: :desc) }

  # Every diagram in a workspace the member belongs to. Resolvers load
  # diagrams through AccessPolicy, which builds on this scope.
  scope :visible_to, ->(member) { where(workspace_id: member.memberships.select(:workspace_id)) }

  private

  def document_is_well_formed
    DiagramDocument.validate(document).each { |message| errors.add(:document, message) }
  end

  def view_settings_are_well_formed
    ViewSettings.validate(view_settings).each { |message| errors.add(:view_settings, message) }
  end

  def count_contents
    self.node_count = document.fetch("nodes", []).size
    self.edge_count = document.fetch("edges", []).size
  end
end
