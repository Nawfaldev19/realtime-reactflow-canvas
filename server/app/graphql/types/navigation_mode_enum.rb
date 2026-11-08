module Types
  class NavigationModeEnum < BaseEnum
    description "How the canvas responds to the wheel and to dragging"

    value "PAN", "Wheel and pinch zoom; dragging empty canvas pans", value: "pan"
    value "SCROLL", "Wheel scrolls like a document; Ctrl or Cmd with the wheel zooms; dragging empty canvas selects", value: "scroll"
  end
end
