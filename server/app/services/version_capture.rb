# Takes a version of a diagram's stored document. With the diagram row locked,
# so version numbers are allocated one at a time and two people capturing at
# once cannot both pass the de-duplication check:
#
# - manual: always a new version (the member asked for it, with an optional label);
# - automatic (the periodic version every 10 minutes of editing): skipped when
#   the document is unchanged since the latest version, or when any version is
#   younger than MIN_AUTOMATIC_GAP (a collaborator's tab already took one);
# - restore (the state kept just before a restore): skipped when unchanged.
#
# Every new version is announced to the diagram's room, so open history panels
# can offer a refresh.
class VersionCapture
  MIN_AUTOMATIC_GAP = 5.minutes

  Outcome = Data.define(:version, :created, :errors) do
    def success? = errors.empty?
  end

  def self.call(...) = new(...).call

  def initialize(diagram:, member:, kind:, label: nil)
    @diagram = diagram
    @member = member
    @kind = kind
    @label = label&.strip.presence
  end

  def call
    outcome = Diagram.transaction do
      @diagram.lock!
      latest = @diagram.versions.newest_first.first
      skip?(latest) ? Outcome.new(version: latest, created: false, errors: []) : capture
    end
    announce(outcome.version) if outcome.created
    outcome
  end

  private

  def skip?(latest)
    return false if @kind == "manual" || latest.nil?
    return true if VersionContent.same?(latest.document, @diagram.document)

    @kind == "automatic" && latest.created_at > MIN_AUTOMATIC_GAP.ago
  end

  def capture
    version = DiagramVersion.capture!(@diagram, author: @member, label: @label, kind: @kind)
    Outcome.new(version: version, created: true, errors: [])
  rescue ActiveRecord::RecordInvalid => e
    Outcome.new(version: nil, created: false, errors: ServiceResult.from_model_errors(e.record).errors)
  end

  def announce(version)
    DiagramChannel.announce(@diagram.id, { type: "versions", number: version.number, by: @member.name })
  end
end
