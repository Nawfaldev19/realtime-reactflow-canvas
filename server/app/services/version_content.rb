# Decides whether two stored documents show the same diagram, for version
# de-duplication. Nodes and edges are compared by id, whatever their order in
# the stored lists; Ruby's Hash equality ignores key order and treats 1 and
# 1.0 alike. The node counter is left out: adding a step and deleting it again
# advances the counter but changes nothing a person can see. The client's
# twin is diffDocuments in client/src/versions/diff.ts.
module VersionContent
  module_function

  def same?(first, second)
    canonical(first) == canonical(second)
  end

  def canonical(document)
    document = {} unless document.is_a?(Hash)
    {
      nodes: index(document["nodes"]),
      edges: index(document["edges"]),
      layout: document["layout"].presence
    }
  end

  def index(entries)
    Array(entries).grep(Hash).index_by { |entry| entry["id"] }
  end
end
