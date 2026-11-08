# Demo data: two makerspaces, five members, three build plans per workspace.
# The walnut side table opens with the build-up animation in preview.
# Safe to run repeatedly: it replaces the demo data each time.

workspace_specs = {
  riverside: { name: "Riverside Makers", slug: "riverside-makers" },
  foundry: { name: "Foundry Lane Workshop", slug: "foundry-lane" }
}

member_specs = {
  ada: ["Ada Okafor", { riverside: "owner", foundry: "editor" }],
  ben: ["Ben Lindqvist", { riverside: "editor" }],
  cora: ["Cora Mbeki", { riverside: "viewer" }],
  theo: ["Theo Marsh", { foundry: "owner" }],
  priya: ["Priya Raman", { foundry: "editor", riverside: "viewer" }]
}

plans_by_workspace = {
  riverside: [
    { author: :ada, title: "Build a walnut side table", animate: true,
      before: ["Pick and mill walnut boards", "Cut legs and aprons", "Cut mortise and tenon joints"],
      decision: "Joints fit snug?", rework: "Pare tenons with a chisel",
      group: ["Glue-up", ["Dry-fit the base", "Glue and clamp the base", "Attach the top with buttons"]],
      after: ["Sand to 220 grit", "Apply an oil finish"],
      notes: { step1: "Mill a spare leg blank in case of tear-out.", group: "Glue sets in 30 minutes, so stage the clamps first." } },
    { author: :ben, title: "Laser-cut lamp shade",
      before: ["Sketch the panel pattern", "Draw the vector file", "Test cut on scrap birch ply"],
      decision: "Kerf within 0.2 mm?", rework: "Adjust power and speed",
      group: ["Assembly", ["Cut six panels", "Slot the panels together", "Fit the bulb holder"]],
      after: ["Test with a warm LED bulb"],
      notes: { step3: "Book the laser cutter for a full hour.", decision: "Measure kerf with calipers on a 20 mm square." } },
    { author: :ada, title: "Wire a weather station",
      before: ["List sensors and the board", "Breadboard the temperature sensor", "Add the wind speed sensor"],
      decision: "Readings stable for an hour?", rework: "Check wiring and pull-ups",
      group: ["Enclosure", ["Drill the vented housing", "Mount the board on standoffs", "Seal the cable glands"]],
      after: ["Mount on the roof mast", "Publish readings to the dashboard"],
      notes: { step2: "Keep the sensor out of direct sun.", end: "Log a week of data before calibrating." } }
  ],
  foundry: [
    { author: :theo, title: "Restore a vintage hand plane",
      before: ["Disassemble and photograph parts", "Remove rust in an oxalic bath", "Flatten the sole on sandpaper"],
      decision: "Sole flat end to end?", rework: "Keep lapping with coarser grit",
      group: ["Blade", ["Grind a fresh bevel", "Hone to a mirror edge", "Set the chipbreaker"]],
      after: ["Reassemble and take a test shaving"],
      notes: { step1: "Bag screws by part so nothing goes missing.", group: "Hone at 30 degrees with a microbevel." } },
    { author: :priya, title: "Weld a steel plant stand",
      before: ["Cut square tube to length", "Grind bevels on the joints", "Tack the frame together"],
      decision: "Frame square on the table?", rework: "Break tacks and re-clamp",
      group: ["Finishing", ["Run full welds", "Grind welds smooth", "Prime and paint"]],
      after: ["Fit the shelf boards"],
      notes: { step3: "Measure both diagonals; they should match within 1 mm.", end: "Use outdoor paint if it lives on the porch." } },
    { author: :theo, title: "Print and assemble a desk organizer",
      before: ["Measure the desk space", "Model the trays", "Slice with 20% infill"],
      decision: "First layer sticking?", rework: "Level the bed and clean the plate",
      group: ["Assembly", ["Print the trays", "Press-fit the dividers", "Add felt feet"]],
      after: ["Label each tray"],
      notes: { step2: "Leave 0.3 mm clearance for press fits.", decision: "Try a brim on the first tray." } }
  ]
}

ActiveRecord::Base.transaction do
  [DiagramOperation, DiagramVersion, Diagram, Membership, Member, Workspace].each(&:delete_all)

  workspaces = workspace_specs.transform_values { |attributes| Workspace.create!(attributes) }
  members = member_specs.to_h do |handle, (name, roles)|
    member = Member.create!(name: name, email: "#{name.split.first.downcase}@example.com")
    roles.each { |workspace, role| Membership.create!(workspace: workspaces.fetch(workspace), member: member, role: role) }
    [handle, member]
  end

  plans_by_workspace.each do |workspace_handle, plans|
    plans.each do |plan|
      author = members.fetch(plan[:author])
      document = DemoPlan.build(seed: "#{workspace_handle}/#{plan[:title].parameterize}", **plan.except(:author, :animate))
      # Plans marked `animate` play the build-up animation when they are previewed.
      view_settings = ViewSettings.defaults.merge("animateOnOpen" => plan.fetch(:animate, false))
      diagram = workspaces.fetch(workspace_handle).diagrams.create!(title: plan[:title], document: document, revision: 1,
                                                                    view_settings: view_settings, created_by: author, updated_by: author)
      DiagramVersion.capture!(diagram, author: author, kind: "created", label: "Created")
    end
  end
end

puts "Seeded #{Workspace.count} workspaces, #{Member.count} members, #{Diagram.count} diagrams."
