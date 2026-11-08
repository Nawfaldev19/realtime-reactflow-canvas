# An immutable snapshot of a diagram's document and view settings, numbered
# per diagram ("v3"). docs/DECISIONS.md (ADR-005) says when versions are made.
class DiagramVersion < ApplicationRecord
  # created: a new diagram or a copy; manual: "Save version"; automatic: the
  # periodic version; restore: the state kept just before a restore.
  KINDS = %w[created manual automatic restore].freeze

  belongs_to :diagram
  belongs_to :workspace
  belongs_to :author, class_name: "Member"

  validates :revision, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :number, numericality: { only_integer: true, greater_than: 0 }
  validates :kind, inclusion: { in: KINDS }
  validates :label, length: { maximum: 80 }
  validate :document_is_well_formed

  before_validation :copy_workspace_from_diagram
  before_validation :assign_number, on: :create

  scope :newest_first, -> { order(number: :desc) }

  # Callers that may race (two people saving at once) hold the diagram's row
  # lock, so numbers are allocated one at a time.
  def self.capture!(diagram, author:, label: nil, kind: "manual")
    create!(diagram: diagram, author: author, label: label, kind: kind, revision: diagram.revision,
            document: diagram.document, view_settings: diagram.view_settings)
  end

  def readonly?
    persisted?
  end

  private

  def copy_workspace_from_diagram
    self.workspace_id ||= diagram&.workspace_id
  end

  def assign_number
    self.number ||= diagram && ((diagram.versions.maximum(:number) || 0) + 1)
  end

  def document_is_well_formed
    DiagramDocument.validate(document).each { |message| errors.add(:document, message) }
  end
end
