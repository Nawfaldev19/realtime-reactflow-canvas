require "test_helper"

class DiagramChannelTest < ActionCable::Channel::TestCase
  setup do
    @workspace = create_workspace
    @editor = add_member(@workspace, create_member(name: "Ada Okafor"))
    @diagram = create_diagram(@workspace, document: document_with(nodes: [node_hash("a"), node_hash("b", number: 2)]))
    @room = DiagramChannel.room(@diagram.id)
  end

  teardown { DiagramChannel.presence_throttle = nil }

  def join_as(member)
    stub_connection current_member: member
    subscribe diagram_id: @diagram.id
    subscription
  end

  # Subscribes and joins; returns the subscription and its sync reply.
  def enter_as(member, resume: nil)
    channel = join_as(member)
    channel.perform_action("action" => "join", "lastSeq" => 0, "resume" => resume)
    [channel, transmissions.last]
  end

  def session_of(channel) = channel.instance_variable_get(:@session_id)

  # Runs the block with `object.name` replaced by `implementation`.
  def replacing(object, name, implementation)
    original = object.method(name)
    object.define_singleton_method(name, &implementation)
    yield
  ensure
    object.define_singleton_method(name, original)
  end

  def capturing_log
    output = StringIO.new
    original = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(output)
    yield
    output.string
  ensure
    Rails.logger = original
  end

  def decoded_broadcasts = broadcasts(@room).map { |message| ActiveSupport::JSON.decode(message) }

  def move(id, x) = { "type" => "node.update", "id" => id, "fields" => { "position" => { "x" => x, "y" => 0 } } }

  test "a member of the workspace joins the room and is announced once, after the first join" do
    join_as(@editor)

    assert_predicate subscription, :confirmed?
    assert_has_stream @room
    assert_empty broadcasts(@room)

    2.times { perform :join, "lastSeq" => 0 }

    assert_equal [{ "type" => "presence", "event" => "join", "sessionId" => session_of(subscription), "memberId" => @editor.id.to_s,
                    "name" => "Ada Okafor", "cursor" => nil, "nodeId" => nil, "editing" => false }], decoded_broadcasts
  end

  test "members of other workspaces and unknown diagrams are rejected" do
    stranger = add_member(create_workspace)
    stub_connection current_member: stranger
    subscribe diagram_id: @diagram.id

    assert_predicate subscription, :rejected?

    stub_connection current_member: @editor
    subscribe diagram_id: 0

    assert_predicate subscription, :rejected?
    assert_empty broadcasts(@room)
  end

  test "the server mints the session id and ignores one the client offers" do
    stub_connection current_member: @editor
    subscribe diagram_id: @diagram.id, session_id: "tab-1"
    perform :join, "lastSeq" => 0
    session = transmissions.last.dig("you", "sessionId")

    assert_match(/\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/, session)
    assert_not_equal "tab-1", session
    assert_not_equal session, enter_as(@editor).last.dig("you", "sessionId")
  end

  test "a resume token brings back the same session, for the same member and diagram only" do
    first, reply = enter_as(@editor)
    _, resumed = enter_as(@editor, resume: reply["resume"])

    assert_equal session_of(first), resumed.dig("you", "sessionId")

    other = add_member(@workspace)

    assert_not_equal session_of(first), enter_as(other, resume: reply["resume"]).last.dig("you", "sessionId")
    assert_not_equal session_of(first), enter_as(@editor, resume: "#{reply['resume']}x").last.dig("you", "sessionId")

    second_diagram = create_diagram(@workspace)
    stub_connection current_member: @editor
    subscribe diagram_id: second_diagram.id
    perform :join, "lastSeq" => 0, "resume" => reply["resume"]

    assert_not_equal session_of(first), transmissions.last.dig("you", "sessionId")
  end

  test "a member who reuses another member's session id and change ids cannot suppress or acknowledge their changes" do
    ada, ada_sync = enter_as(@editor)
    ben = add_member(@workspace, create_member(name: "Ben Lindqvist"))
    stub_connection current_member: ben
    subscribe diagram_id: @diagram.id, session_id: ada_sync.dig("you", "sessionId")
    intruder = subscription
    intruder.perform_action("action" => "join", "lastSeq" => 0, "resume" => ada_sync["resume"])
    intruder.perform_action("action" => "submit", "clientOpId" => "1", "op" => move("b", 99))
    ada.perform_action("action" => "submit", "clientOpId" => "1", "op" => move("a", 10))
    ops = decoded_broadcasts.select { |message| message["type"] == "op" }

    assert_equal([[ben.id.to_s, "1", 1], [@editor.id.to_s, "1", 2]], ops.map { |op| op.values_at("memberId", "clientOpId", "seq") })
    assert_equal session_of(ada), ops.last["sessionId"]
    assert_not_equal session_of(ada), ops.first["sessionId"]
    assert_equal({ "x" => 10, "y" => 0 }, @diagram.reload.document["nodes"].find { |node| node["id"] == "a" }["position"])
    assert_not(transmissions.any? { |message| message["type"] == "ack" })
  end

  test "presence carries the session id but never the resume token" do
    _, reply = enter_as(@editor)
    perform :presence, "cursor" => nil

    decoded_broadcasts.each do |message|
      assert_not_includes message.to_json, reply["resume"]
      assert_equal %w[cursor editing event memberId name nodeId sessionId type], message.keys.sort
    end
  end

  test "join replies to this subscriber only, with the operations it missed and who it is" do
    join_as(@editor)
    perform :submit, "clientOpId" => "1", "op" => move("a", 10)
    perform :submit, "clientOpId" => "2", "op" => move("b", 20)
    perform :join, "lastSeq" => 1
    reply = transmissions.last

    assert_equal %w[sync ops 2], reply.values_at("type", "mode", "revision").map(&:to_s)
    assert_equal [2], reply["ops"].pluck("seq")
    assert_equal({ "sessionId" => session_of(subscription), "memberId" => @editor.id.to_s, "name" => "Ada Okafor" }, reply["you"])
    assert reply["canEdit"]
    assert_kind_of String, reply["resume"]
  end

  test "a join without a usable number gets a snapshot" do
    join_as(@editor)
    perform :join, "lastSeq" => "seven"

    assert_equal "snapshot", transmissions.last["mode"]
    assert_equal @diagram.document, transmissions.last["document"]
  end

  test "an accepted operation is broadcast in full to everyone, with its sequence number" do
    join_as(@editor)
    operation = { "type" => "node.add", "node" => node_hash("c", number: 3) }
    perform :submit, "clientOpId" => "7", "op" => operation

    assert_equal({ "type" => "op", "seq" => 1, "sessionId" => session_of(subscription), "clientOpId" => "7", "memberId" => @editor.id.to_s,
                   "op" => operation },
                 decoded_broadcasts.last)
    assert_equal 1, @diagram.reload.revision
    assert_includes @diagram.document["nodes"].pluck("id"), "c"
  end

  test "operations from two sessions are numbered in the order the server accepts them" do
    other = add_member(@workspace)
    first = join_as(@editor)
    second = join_as(other)
    [[first, "a", 1], [second, "b", 2], [first, "a", 3], [second, "a", 4]].each do |channel, id, x|
      channel.perform_action("action" => "submit", "clientOpId" => x.to_s, "op" => move(id, x))
    end
    ops = decoded_broadcasts.select { |message| message["type"] == "op" }

    assert_equal [1, 2, 3, 4], ops.pluck("seq")
    assert_equal [first, second, first, second].map { |channel| session_of(channel) }, ops.pluck("sessionId")
    assert_equal({ "x" => 4, "y" => 0 }, @diagram.reload.document["nodes"].first["position"])
  end

  test "a viewer can join and watch but every operation is rejected" do
    viewer = add_member(@workspace, role: "viewer")
    join_as(viewer)
    perform :join, "lastSeq" => 0

    assert_not transmissions.last["canEdit"]

    perform :submit, "clientOpId" => "1", "op" => move("a", 10)

    assert_equal({ "type" => "rejected", "clientOpId" => "1", "code" => "FORBIDDEN",
                   "message" => "Your role in this workspace does not allow editing" }, transmissions.last)
    assert_equal 0, @diagram.reload.revision
    assert_empty(decoded_broadcasts.select { |message| message["type"] == "op" })
  end

  test "a re-sent operation is acknowledged instead of applied again" do
    join_as(@editor)
    2.times { perform :submit, "clientOpId" => "1", "op" => { "type" => "node.remove", "id" => "a" } }

    assert_equal({ "type" => "ack", "clientOpId" => "1", "seq" => 1 }, transmissions.last)
    assert_equal 1, @diagram.reload.revision
  end

  test "an operation without a client operation id is rejected" do
    join_as(@editor)
    perform :submit, "op" => move("a", 1)

    assert_equal %w[rejected INVALID], transmissions.last.values_at("type", "code")
  end

  test "malformed changes are rejected with a reason, never applied and never crash the channel" do
    join_as(@editor)
    {
      "z is a list" => { "type" => "node.add", "node" => node_hash("x", number: 3).merge("z" => []) },
      "position is text" => { "type" => "node.update", "id" => "a", "fields" => { "position" => { "x" => "left", "y" => 0 } } },
      "number is a float" => { "type" => "node.update", "id" => "a", "fields" => { "number" => 1.5 } },
      "text too long" => { "type" => "node.update", "id" => "a", "fields" => { "data" => { "text" => "w" * 20_001 } } },
      "unknown node kind" => { "type" => "node.add", "node" => node_hash("x", kind: "spaceship", number: 3) },
      "unknown operation" => { "type" => "node.explode", "id" => "a" },
      "edge route is text" => { "type" => "edge.add", "edge" => edge_hash("e", "a", "b").merge("route" => "curvy") },
      "not an object" => [1, 2, 3]
    }.each_with_index do |(name, operation), index|
      perform :submit, "clientOpId" => "bad-#{index}", "op" => operation

      assert_equal ["rejected", "bad-#{index}", "INVALID"], transmissions.last.values_at("type", "clientOpId", "code"), name
      assert_match(/\AThis change is not a valid operation: /, transmissions.last["message"], name)
    end
    assert_equal 0, @diagram.reload.revision
    assert_empty(decoded_broadcasts.select { |message| message["type"] == "op" })
  end

  test "an unexpected error while applying a change is logged and rejected, so the client stops re-sending it" do
    join_as(@editor)
    logged = capturing_log do
      replacing(OperationSubmit, :call, lambda { |**|
        raise ArgumentError, "boom"
      }) { perform :submit, "clientOpId" => "9", "op" => move("a", 1) }
    end

    assert_equal({ "type" => "rejected", "clientOpId" => "9", "code" => "SERVER_ERROR",
                   "message" => "The server could not apply this change" }, transmissions.last)
    assert_match(/DiagramChannel submit failed .*ArgumentError: boom/, logged)
  end

  test "an unexpected error in any other action is logged and answered with an error" do
    join_as(@editor)
    logged = capturing_log do
      replacing(DiagramSync, :reply, ->(*) { raise KeyError, "lost" }) { perform :join, "lastSeq" => 0 }
    end

    assert_equal({ "type" => "error", "message" => "The server could not handle this request" }, transmissions.last)
    assert_match(/DiagramChannel action failed .*KeyError: lost/, logged)
  end

  test "presence is relayed with the identity the server knows, cleaned" do
    join_as(@editor)
    perform :presence, "cursor" => { "x" => 10.04, "y" => -3 }, "nodeId" => "a", "editing" => true, "name" => "Somebody else"

    assert_equal({ "type" => "presence", "event" => "update", "sessionId" => session_of(subscription), "memberId" => @editor.id.to_s,
                   "name" => "Ada Okafor", "cursor" => { "x" => 10.0, "y" => -3.0 }, "nodeId" => "a", "editing" => true },
                 decoded_broadcasts.last)

    perform :presence, "cursor" => { "x" => "left" }, "nodeId" => "<script>", "editing" => "yes"

    assert_equal [nil, nil, false], decoded_broadcasts.last.values_at("cursor", "nodeId", "editing")
  end

  test "presence beyond the per-second limit is dropped, and relayed again in the next second" do
    join_as(@editor)
    now = 0.0
    DiagramChannel.presence_throttle = Throttle.new(limit: DiagramChannel::PRESENCE_PER_SECOND, period: 1, clock: -> { now })
    relayed = -> { decoded_broadcasts.count { |message| message["event"] == "update" } }
    (DiagramChannel::PRESENCE_PER_SECOND + 5).times { |i| perform :presence, "cursor" => { "x" => i, "y" => 0 } }

    assert_equal DiagramChannel::PRESENCE_PER_SECOND, relayed.call

    now = 1.0
    perform :presence, "cursor" => { "x" => 1, "y" => 1 }

    assert_equal DiagramChannel::PRESENCE_PER_SECOND + 1, relayed.call
  end

  test "the presence limit is per member, so extra subscriptions do not raise it" do
    DiagramChannel.presence_throttle = Throttle.new(limit: DiagramChannel::PRESENCE_PER_SECOND, period: 1, clock: -> { 0.0 })
    tabs = Array.new(3) { join_as(@editor) }
    tabs.cycle.first(DiagramChannel::PRESENCE_PER_SECOND * 2).each { |tab| tab.perform_action("action" => "presence", "cursor" => nil) }
    other = join_as(add_member(@workspace))
    other.perform_action("action" => "presence", "cursor" => nil)
    updates = decoded_broadcasts.select { |message| message["event"] == "update" }

    assert_equal(DiagramChannel::PRESENCE_PER_SECOND, updates.count { |message| message["memberId"] == @editor.id.to_s })
    assert_equal(1, updates.count { |message| message["memberId"] != @editor.id.to_s })
  end

  test "a member removed from the workspace is cut off at their next action" do
    channel, = enter_as(@editor)
    @editor.memberships.find_by(workspace: @workspace).destroy!
    channel.perform_action("action" => "submit", "clientOpId" => "1", "op" => move("a", 10))

    assert_predicate channel, :rejected?
    assert_no_streams
    assert_equal "reject_subscription", connection.transmissions.last["type"]
    assert_equal 0, @diagram.reload.revision
  end

  test "removing a member or dropping them to viewer disconnects their sockets" do
    membership = @editor.memberships.find_by(workspace: @workspace)
    sockets = "action_cable/#{@editor.to_gid_param}"

    assert_broadcasts(sockets, 1) { membership.update!(role: "viewer") }
    assert_no_broadcasts(sockets) { membership.update!(role: "viewer") }
    assert_broadcasts(sockets, 1) { membership.destroy! }
  end

  test "a promotion keeps the sockets open" do
    viewer = add_member(@workspace, role: "viewer")
    membership = viewer.memberships.sole

    assert_no_broadcasts("action_cable/#{viewer.to_gid_param}") { membership.update!(role: "editor") }
  end

  test "an editor dropped to viewer can no longer submit" do
    channel, = enter_as(@editor)
    @editor.memberships.find_by(workspace: @workspace).update!(role: "viewer")
    channel.perform_action("action" => "submit", "clientOpId" => "1", "op" => move("a", 10))

    assert_equal %w[rejected FORBIDDEN], transmissions.last.values_at("type", "code")
    channel.perform_action("action" => "join", "lastSeq" => 0)

    assert_not transmissions.last["canEdit"]
  end

  test "leaving the room is announced once the session was announced" do
    join_as(@editor)
    unsubscribe

    assert_empty broadcasts(@room)

    channel, = enter_as(@editor)
    unsubscribe

    assert_equal ["presence", "leave", session_of(channel)], decoded_broadcasts.last.values_at("type", "event", "sessionId")
  end
end
