// The landing page's guided tour: one stop per hero feature, each with what it
// shows and where to try it in the seeded demo. Kept as data so the tour and
// its test cannot drift apart.

export interface TourStop {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly tryIt: readonly string[];
}

export const TOUR: readonly TourStop[] = [
  {
    id: "orthogonal",
    title: "Orthogonal routing with editable segments",
    summary:
      "Step connectors choose their sides, go around the steps they join and round their corners. Edited " +
      "routes keep your segments and re-attach when steps move.",
    tryIt: [
      "Sign in as Ada Okafor and open “Build a walnut side table”.",
      "Click a connector and drag one of its middle segment handles: it slides along one axis.",
      "Drag the first or last segment to add a bend at the stub, then move a step and watch the route re-attach.",
    ],
  },
  {
    id: "route-styles",
    title: "Four route styles and control points",
    summary:
      "Polyline, Catmull-Rom spline, Bézier-flavoured spline and orthogonal step, with draggable points, " +
      "“add point” handles, snapping in screen pixels and keyboard nudging.",
    tryIt: [
      "Select a connector and pick a route style under Route in the properties panel.",
      "Drag a small midpoint handle to add a point; drag it level with either end of the connector and it snaps into line.",
      "Tab to a point and move it with the arrow keys (Alt for 1 unit).",
    ],
  },
  {
    id: "guides",
    title: "Alignment guides that do not flicker",
    summary:
      "While you drag or resize, guides appear for the nearest steps’ edges and centres, within a radius " +
      "measured in screen pixels at any zoom.",
    tryIt: [
      "Drag a step slowly past its neighbours and watch the guides.",
      "Open Snapping in the toolbar to switch guides off or change how many steps take part.",
    ],
  },
  {
    id: "collaboration",
    title: "Real-time collaboration",
    summary:
      "Edits travel as operations; the server orders, stores and broadcasts them. Live cursors, name tags " +
      "and “editing” badges; every copy converges.",
    tryIt: [
      "Open the same diagram as Ada in one window and as Ben Lindqvist in a private window.",
      "Move a step or type in a note in one window and watch the other.",
    ],
  },
  {
    id: "reveal",
    title: "A diagram that builds itself up",
    summary:
      "In the preview, steps fade in in reading order and each connector draws from its source to its " +
      "target, arrowhead last. Skip, Replay and reduced motion are supported.",
    tryIt: ["Choose Preview on “Build a walnut side table”.", "Use Replay and Skip in the footer."],
  },
  {
    id: "line",
    title: "Line rotation that never drifts",
    summary:
      "Lines store an angle and a length, so the pivot stays put and the length never grows, however often " +
      "you rotate. Near 0°, 90°, 180° and 270° a dashed guide previews the snap.",
    tryIt: [
      "Add a line from the toolbar, select it and drag its round rotate handle.",
      "Rotate close to vertical and release on the dashed guide.",
    ],
  },
  {
    id: "groups",
    title: "Group nodes",
    summary:
      "Groups hold their children in their own coordinate space, sit under the connectors, and survive " +
      "save, copy and paste, versions and collaboration.",
    tryIt: [
      "Drag a step into the “Glue-up” group; hold Alt while dragging to take it out again.",
      "Select two steps and choose Group in the selection toolbar.",
    ],
  },
  {
    id: "performance",
    title: "Fast on large diagrams",
    summary:
      "Visible-only rendering, no-op guards, stable callbacks and memoized node bodies keep a 2,000-node " +
      "diagram dragging at 60 frames a second.",
    tryIt: [
      "Open /stress?stress&size=2000 and drag a step.",
      "Use the links on that page to switch each technique off and compare.",
    ],
  },
];
