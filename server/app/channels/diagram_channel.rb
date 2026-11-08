# The collaboration room of one diagram (protocol: docs/features/collaboration.md).
#
# Subscribing needs a session token (ApplicationCable::Connection) and a
# membership in the diagram's workspace; viewers may join, watch and show
# their cursor, but only owners and editors can submit operations. The
# membership is checked again before every action: a member removed from the
# workspace has the subscription rejected (Membership also disconnects their
# sockets the moment it is removed or demoted).
#
# The collaboration session id is minted here, never taken from the client.
# A reconnecting tab keeps its session by sending back the signed resume token
# (SessionResume) it got in its last `sync` reply.
#
# Client actions:
# - join(lastSeq, resume): replies (to this subscriber only) with the
#   operations after lastSeq or a snapshot (DiagramSync), the session identity
#   and a fresh resume token. The first join is announced to the room;
# - submit(clientOpId, op): the server orders, applies and stores the
#   operation (OperationSubmit) and broadcasts it, with its sequence number,
#   the sender's session and client operation id, to everyone, the sender
#   included. Problems, including unexpected errors, go back to the sender
#   only, as "rejected", so the client drops the change instead of re-sending it;
# - presence(cursor, nodeId, editing): relayed to everyone with the sender's
#   identity attached by the server, never persisted. At most
#   PRESENCE_PER_SECOND messages per member are relayed, however many
#   subscriptions they open; the rest are dropped (each tab sends at most 20 a
#   second, plus selection changes).
class DiagramChannel < ApplicationCable::Channel
  PRESENCE_PER_SECOND = 60

  class << self
    attr_writer :presence_throttle

    def room(diagram_id) = "diagram:#{diagram_id}"

    # Control events (the collaboration switch) reach every open editor.
    def announce(diagram_id, message)
      ActionCable.server.broadcast(room(diagram_id), message)
    end

    # Counts presence per member, shared by every subscription in this process.
    def presence_throttle
      @presence_throttle ||= Throttle.new(limit: PRESENCE_PER_SECOND, period: 1)
    end
  end

  rescue_from StandardError, with: :report_error

  def subscribed
    @diagram_id = AccessPolicy.diagram!(current_member, params[:diagram_id]).id
    @session_id = SecureRandom.uuid
    stream_from self.class.room(@diagram_id)
  rescue AccessPolicy::NotFound
    reject
  end

  def unsubscribed
    broadcast_presence("leave") if @announced
  end

  def perform_action(data)
    return super if member?

    reject
    reject_subscription
  end

  def join(data)
    @session_id = SessionResume.session_for(data["resume"], member_id: current_member.id, diagram_id: @diagram_id) || @session_id
    last_seq = data["lastSeq"]
    reply = DiagramSync.reply(@diagram_id, last_seq.is_a?(Integer) ? last_seq : nil)
    resume = SessionResume.issue(member_id: current_member.id, diagram_id: @diagram_id, session_id: @session_id)
    transmit(reply.merge(you: identity, canEdit: can_edit?, resume: resume))
    announce_once
  end

  def submit(data)
    client_op_id = data["clientOpId"]
    unless DiagramDocument::Shape.identifier?(client_op_id)
      return transmit_rejection(client_op_id, "INVALID", "A change needs a client operation id")
    end

    deliver(client_op_id, OperationSubmit.call(diagram_id: @diagram_id, member: current_member, session_id: @session_id,
                                               client_op_id: client_op_id, operation: data["op"]))
  rescue StandardError => e
    log_error(e, "submit")
    transmit_rejection(client_op_id, "SERVER_ERROR", "The server could not apply this change")
  end

  def presence(data)
    return unless self.class.presence_throttle.allow?(current_member.id)

    broadcast_presence("update", cursor: cursor_from(data["cursor"]), node_id: node_id_from(data["nodeId"]),
                                 editing: data["editing"] == true)
  end

  private

  def deliver(client_op_id, outcome)
    if outcome.accepted?
      ActionCable.server.broadcast(self.class.room(@diagram_id), outcome.entry.message)
    elsif outcome.duplicate?
      transmit({ type: "ack", clientOpId: client_op_id, seq: outcome.entry.sequence })
    else
      transmit_rejection(client_op_id, outcome.code, outcome.message)
    end
  end

  def announce_once
    return if @announced

    @announced = true
    broadcast_presence("join")
  end

  def membership
    Membership.find_by(workspace_id: Diagram.where(id: @diagram_id).select(:workspace_id), member_id: current_member.id)
  end

  def member? = !membership.nil?
  def can_edit? = membership&.can_edit? || false

  def identity
    { sessionId: @session_id, memberId: current_member.id.to_s, name: current_member.name }
  end

  def broadcast_presence(event, cursor: nil, node_id: nil, editing: false)
    ActionCable.server.broadcast(self.class.room(@diagram_id),
                                 { type: "presence", event: event, **identity, cursor: cursor, nodeId: node_id, editing: editing })
  end

  def transmit_rejection(client_op_id, code, message)
    transmit({ type: "rejected", clientOpId: client_op_id, code: code, message: message })
  end

  def report_error(error)
    log_error(error, "action")
    transmit({ type: "error", message: "The server could not handle this request" })
  end

  def log_error(error, action)
    Rails.logger.error("DiagramChannel #{action} failed for diagram #{@diagram_id}: #{error.class}: #{error.message}")
  end

  def cursor_from(value)
    return nil unless DiagramDocument::Shape.point?(value)

    { x: value["x"].to_f.round(1), y: value["y"].to_f.round(1) }
  end

  def node_id_from(value) = DiagramDocument::Shape.identifier?(value) ? value : nil
end
