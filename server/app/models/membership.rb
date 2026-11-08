class Membership < ApplicationRecord
  ROLES = %w[owner editor viewer].freeze

  belongs_to :workspace
  belongs_to :member

  enum :role, ROLES.index_by(&:itself), validate: true

  validates :member_id, uniqueness: { scope: :workspace_id }

  # Open collaboration sockets were authorized for the old role. Dropping them
  # makes the client reconnect, and DiagramChannel then checks the new role
  # (or rejects a member who was removed), so nobody keeps receiving or
  # sending changes on access they no longer have.
  after_commit :disconnect_sockets, on: %i[update destroy], if: :access_reduced?

  def can_edit?
    owner? || editor?
  end

  private

  def access_reduced? = destroyed? || (saved_change_to_role? && !can_edit?)

  def disconnect_sockets
    ActionCable.server.remote_connections.where(current_member: member).disconnect
  end
end
