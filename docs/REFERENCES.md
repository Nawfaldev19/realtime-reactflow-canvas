# References and credits

Public sources this project adapted or checked itself against. Modules that adapt a source say so in a comment at the top.

## React Flow (MIT, xyflow)

| Source | What I took | Where |
|---|---|---|
| [Floating Edges example](https://reactflow.dev/examples/edges/floating-edges) | The ray/box intersection between two box centres and the side classification. Extended to rounded rectangles, ellipses, diamonds and convex polygons. | `client/src/geometry/outline.ts` |
| Smooth step edge (`getSmoothStepPath`) | The point generation (stubs, primary axis, one or two corners) and corner rounding, re-implemented from a written description and compared with the library's output for 192 paths. The detour search, editable segments and re-attachment are mine. | `client/src/routing/orthogonal.ts`, `stepEdit.ts` |
| Bézier edge (`getBezierPath`) | The standard curve's control-point offset, used for the ends of the Bézier-flavoured spline; checked against the library within 0.01 units. | `client/src/routing/spline.ts` |
| [Add Node On Edge Drop](https://reactflow.dev/examples/nodes/add-node-on-edge-drop), [Temporary Edges](https://reactflow.dev/examples/edges/temporary-edges) | `onConnectEnd` with the connection state's validity flag, and `screenToFlowPosition` for the new node. The ghost step, shape menu and multi-source connect are mine. | `client/src/editor/DropMenu.tsx`, `Canvas.tsx` |
| [Drag and Drop example](https://reactflow.dev/examples/interaction/drag-and-drop) | Sidebar drops with a custom data type and `screenToFlowPosition`. | `client/src/editor/ShapeLibrary.tsx` |
| [Download Image example](https://reactflow.dev/examples/misc/download-image) | Rasterising the viewport with html-to-image and a translate-and-scale style. Per-page capture, pagination and the PDF writer are mine. | `client/src/export/capture.ts` |
| [Sub Flows guide](https://reactflow.dev/learn/layouting/sub-flows) | `parentId`, relative child positions, `extent: "parent"`, parents before children. | `client/src/document/groups.ts` |
| [Performance guide](https://reactflow.dev/learn/advanced-use/performance), [`onlyRenderVisibleElements`](https://reactflow.dev/api-reference/react-flow#onlyrendervisibleelements) | Memoized nodes, stable props, visible-only rendering. The frame/content split, static handles, switches and benchmark are mine. | `client/src/editor/Canvas.tsx`, `nodes/nodeFrame.tsx` |
| [`ViewportPortal`](https://reactflow.dev/api-reference/components/viewport-portal) | Rendering collaborators' cursors inside the canvas's transformed layer. | `client/src/editor/PresenceOverlay.tsx` |
| API documentation (custom edges and nodes, `NodeToolbar`, `setViewport`, `translateExtent`, navigation flags) | Standard use of the public API. | `client/src/editor/`, `client/src/view/` |

The alignment guides do not use React Flow's helper-lines example; the sorted index and its snapping rules are my own.

## Libraries

| Source | Use | Where |
|---|---|---|
| [Rails Action Cable guide](https://guides.rubyonrails.org/action_cable_overview.html) and [testing guide](https://guides.rubyonrails.org/testing.html#testing-action-cable) | Connection authentication, `stream_from`, `transmit`, broadcasts; connection and channel test cases | `server/app/channels/`, `server/test/channels/` |
| [`@rails/actioncable`](https://www.npmjs.com/package/@rails/actioncable) (MIT) | The browser consumer; reconnection is mine | `client/src/collab/cable.ts` |
| [`@dagrejs/dagre`](https://github.com/dagrejs/dagre) (MIT) | The "Fast" layout engine | `client/src/layout/dagre.ts` |
| [`html-to-image`](https://github.com/bubkoo/html-to-image) 1.11.11 (MIT) | `toCanvas` for export | `client/src/export/capture.ts` |
| [`d3-zoom`](https://github.com/d3/d3-zoom) (ISC, inside React Flow) | Its translate-extent constraint, reproduced so pan bounds can be unit-tested | `client/src/viewport/panBounds.ts` |
| [`gifenc`](https://github.com/mattdesl/gifenc) and [`pngjs`](https://github.com/pngjs/pngjs) (MIT) | Encoding the README animation from Playwright screencast frames | `client/scripts/record-hero.ts` |

## Web platform and standards

- MDN: the Web Animations API, `getTotalLength()`, `stroke-dasharray` and `stroke-dashoffset` (the reveal draw); `prefers-reduced-motion`; `devicePixelRatio` (the guide canvas); User Timing, `requestAnimationFrame` and `MessageChannel` (the benchmark); `Content-Security-Policy` and related headers; the ARIA `switch` and `scrollbar` roles.
- PDF structure: ISO 32000-1:2008, whose objects match the PDF 1.4 written by `client/src/export/pdf.ts`.
- Contrast: W3C, [WCAG 2.1](https://www.w3.org/TR/WCAG21/), relative luminance and contrast ratio (criteria 1.4.3 and 1.4.11), for collaborator colours.
- [OSV API](https://google.github.io/osv.dev/api/) for the gem advisory check; npm lockfile v3 and installed gemspecs for the licence audit.

## Papers and textbooks

- L. Lamport, "Time, Clocks, and the Ordering of Events in a Distributed System", CACM 21(7), 1978: the contrast for [ADR-001](DECISIONS.md#adr-001-a-server-ordered-operation-log-instead-of-a-crdt). A central sequencer gives the total order directly, so clients need no logical clocks.
- K. Sugiyama, S. Tagawa and M. Toda, "Methods for visual understanding of hierarchical system structures", IEEE SMC 11(2), 1981, and G. Di Battista et al., *Graph Drawing*, 1999, chapter 9: the phases of the layered layout.
- W. Barth, M. Jünger and P. Mutzel, "Simple and efficient bilayer cross counting", Graph Drawing 2002, with a Fenwick tree (P. M. Fenwick, 1994): the exact crossing count.
- M. Ayer et al., 1955: pool adjacent violators, for order-preserving coordinate assignment.
- E. Catmull and R. Rom, "A class of local interpolating splines", 1974: the splines; the conversion to cubic Béziers is derived in `client/src/routing/spline.ts`.
- G. Fowler, L. C. Noll and K.-P. Vo: FNV-1a hashing (public domain), for derived point ids and member colours, tested with the published vectors.
