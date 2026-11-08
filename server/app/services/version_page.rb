# Keyset pagination over a diagram's versions, newest first. The cursor is the
# last version number shown, so a version saved while someone is paging never
# shifts the next page (an offset would repeat a row).
class VersionPage
  MAX_SIZE = 50

  class InvalidCursor < StandardError; end

  def self.call(diagram, first:, after:)
    size = first.clamp(1, MAX_SIZE)
    scope = diagram.versions.newest_first.select(DiagramVersion.column_names - %w[document view_settings])
    scope = scope.where(number: ...decode(after)) if after
    rows = scope.limit(size + 1).to_a
    nodes = rows.first(size)
    more = rows.size > size
    { nodes: nodes, total_count: diagram.versions.count, has_next_page: more, end_cursor: more ? encode(nodes.last.number) : nil }
  end

  def self.encode(number) = Base64.urlsafe_encode64("version:#{number}", padding: false)

  def self.decode(cursor)
    match = /\Aversion:(\d+)\z/.match(Base64.urlsafe_decode64(cursor))
    match ? match[1].to_i : raise(InvalidCursor)
  rescue ArgumentError
    raise InvalidCursor
  end
end
