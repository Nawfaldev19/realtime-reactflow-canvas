# One makerspace. Every diagram belongs to exactly one workspace.
class Workspace < ApplicationRecord
  has_many :memberships, dependent: :destroy
  has_many :members, through: :memberships
  has_many :diagrams, dependent: :destroy

  validates :name, presence: true, length: { maximum: 80 }
  validates :slug, presence: true, uniqueness: true, format: { with: /\A[a-z0-9-]+\z/ }
  # Used for members who have not chosen a navigation mode themselves.
  validates :navigation_mode, inclusion: { in: NavigationMode::ALL }
end
