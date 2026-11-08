module Types
  class VersionKindEnum < BaseEnum
    description "How a version was made"

    value "CREATED", "The first version of a new diagram or a copy", value: "created"
    value "MANUAL", "Saved by a member, optionally with a label", value: "manual"
    value "AUTOMATIC", "Taken every 10 minutes of editing, when something changed", value: "automatic"
    value "RESTORE", "The diagram as it was just before a restore", value: "restore"
  end
end
