# A person who can sign in. Members reach workspaces only through memberships.
class Member < ApplicationRecord
  has_many :memberships, dependent: :destroy
  has_many :workspaces, through: :memberships

  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :name, presence: true, length: { maximum: 80 }
  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  # Null means "use the workspace default".
  validates :navigation_mode, inclusion: { in: NavigationMode::ALL }, allow_nil: true

  def initials
    name.split.first(2).pluck(0).join.upcase
  end

  # The member's membership in a workspace, or nil. Memoized per instance so a
  # request that checks many diagrams issues one query.
  def membership_in(workspace_id)
    @memberships_by_workspace ||= memberships.index_by(&:workspace_id)
    @memberships_by_workspace[workspace_id.to_i]
  end
end
