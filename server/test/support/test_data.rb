# Small builders instead of fixtures: each test states exactly the data it needs.
module TestData
  def create_member(name: "Test Member")
    Member.create!(name: name, email: "member-#{SecureRandom.hex(4)}@example.com")
  end

  def create_workspace(name: "Test Space")
    Workspace.create!(name: name, slug: "space-#{SecureRandom.hex(4)}")
  end

  def add_member(workspace, member = create_member, role: "editor")
    Membership.create!(workspace: workspace, member: member, role: role)
    member
  end

  # Live collaboration is on by default, as for every new diagram; whole-document
  # saves need it off.
  def create_diagram(workspace, title: "Test plan", author: nil, document: DocumentBuilder.starter(title), collaboration: true)
    workspace.diagrams.create!(title: title, document: document, created_by: author, updated_by: author,
                               collaboration_enabled: collaboration)
  end

  # A minimal valid document with the given nodes and edges.
  def document_with(nodes: [], edges: [])
    { "schemaVersion" => 1, "nodes" => nodes, "edges" => edges, "nextNumber" => nodes.size + 1 }
  end

  def node_hash(id, kind: "step", parent: nil, number: 1)
    { "id" => id, "key" => id, "kind" => kind, "number" => number, "position" => { "x" => 0, "y" => 0 },
      "size" => { "width" => 100, "height" => 50 }, "parentId" => parent, "z" => number, "style" => {}, "data" => { "text" => id } }
  end

  def edge_hash(id, source, target)
    { "id" => id, "key" => id, "kind" => "connector", "source" => source, "target" => target, "sourceSide" => nil,
      "targetSide" => nil, "route" => { "style" => "step", "points" => [] }, "label" => nil, "style" => {} }
  end
end
