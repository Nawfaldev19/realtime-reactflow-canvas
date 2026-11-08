# Decisions

The ten decisions that shape the system are written up as records (title, status, context, decision, consequences). Smaller choices follow in one table at the end, one line each.

| # | Decision |
|---|---|
| [ADR-001](#adr-001-a-server-ordered-operation-log-instead-of-a-crdt) | A server-ordered operation log instead of a CRDT |
| [ADR-002](#adr-002-the-server-mints-collaboration-sessions-and-a-signed-token-resumes-them) | The server mints collaboration sessions, and a signed token resumes them |
| [ADR-003](#adr-003-sqlite-and-a-single-process-cable-adapter) | SQLite and a single-process cable adapter |
| [ADR-004](#adr-004-visible-only-rendering-with-every-performance-technique-switchable) | Visible-only rendering, with every performance technique switchable |
| [ADR-005](#adr-005-versions-are-snapshots-compared-and-restored-by-stable-key) | Versions are snapshots, compared and restored by stable key |
| [ADR-006](#adr-006-my-own-orthogonal-router) | My own orthogonal router |
| [ADR-007](#adr-007-alignment-guides-from-a-sorted-incrementally-updated-index) | Alignment guides from a sorted, incrementally updated index |
| [ADR-008](#adr-008-my-own-layered-layout-next-to-dagre-and-no-elk) | My own layered layout next to dagre, and no ELK |
| [ADR-009](#adr-009-my-own-pdf-writer) | My own PDF writer |
| [ADR-010](#adr-010-the-reveal-animation-a-pure-planner-and-one-cancellable-controller) | The reveal animation: a pure planner and one cancellable controller |

## ADR-001: A server-ordered operation log instead of a CRDT

**Status:** Accepted

**Context.** Several people edit one diagram at once. Every edit is already an operation (`node.add`, `node.update`, `batch` and a few more) applied by one pure function, `applyOperation`. The usual options are a CRDT on every client (logical clocks and tombstones, with a relay server) or a central sequencer. The server must check roles and validate every document anyway, so it sees each change regardless.

**Decision.** The server is the only writer of a collaborative diagram. `OperationSubmit` handles each submitted operation in one transaction with the diagram row locked: it re-reads the member's role, checks the collaboration switch, refuses a repeat, applies the operation with `OperationApplier` (a rule-for-rule Ruby port of `applyOperation`), validates the whole resulting document, writes it with `revision + 1` and logs the operation under that number in `diagram_operations` (pruned to the last 2,000 per diagram). After the commit it broadcasts the full operation, never a list of ids. Whole-document saves are refused while collaboration is on.

Clients keep a confirmed copy and a pending queue; the visible document is the confirmed one with the queue replayed on top. A sequencer applies broadcasts strictly in order and rejoins from the log, or a snapshot, when a number is missing for a second. The same 22 operation cases run against both appliers.

**Consequences.**
- Copies converge without clocks or tombstones; a threaded server test checks that the stored document equals the broadcast stream replayed in order.
- Merging is per field: concurrent changes to different fields both survive; to the same field, the one ordered last wins. A note's text is one field, so two people typing in the same note are not merged character by character.
- Every operation costs a database write before peers see it, and a single operation is capped at 256 KB, which can refuse a restore of a very large diagram.
- The Ruby port has to change with the TypeScript one; the shared cases fail on either side when they drift.

## ADR-002: The server mints collaboration sessions, and a signed token resumes them

**Status:** Accepted. Replaces the client-chosen session id of 1.0.0.

**Context.** A re-sent operation must not be applied twice, so the server recognises repeats by session and client operation id (the client's local sequence number). In 1.0.0 the client chose its session id, and every peer learned it from presence. Another editor could join with that id, submit the victim's next client operation id, and make the victim's real change come back as an already-stored duplicate: acknowledged, dropped from the pending queue, never applied.

**Decision.** `DiagramChannel#subscribed` mints the session id (`SecureRandom.uuid`) and ignores any value the client sends. Repeats are recognised by member, session and client operation id together, with a unique index on (diagram, member, session, client operation id). Each `sync` reply tells the tab its session id and gives it a resume token, signed with Rails' message verifier for the purpose "collaboration-session", naming member, diagram and session, valid for 12 hours. A reconnecting tab sends it back with `join` and keeps its session; a token presented by another member or for another diagram is ignored. The token goes only to its own subscriber, never into presence, and the client keeps it in memory.

**Consequences.**
- One member can never acknowledge or suppress another member's changes; channel and client tests cover a member reusing another's session id and change ids, a stolen token, and presence never carrying the token.
- A reconnect keeps de-duplication working for operations re-sent after a dropped socket.
- A page reload starts a new session. Pending operations live in that page's memory, so nothing is lost that was not already gone.

## ADR-003: SQLite and a single-process cable adapter

**Status:** Accepted

**Context.** Reviewers should be able to clone the repository and run it with one command, with no database server or message broker.

**Decision.** SQLite in development, test and end-to-end runs (`storage/e2e.sqlite3` for the browser tests), and the in-process `async` Action Cable adapter. Saves and operations still lock the diagram row (`lock!`), as they would on PostgreSQL. Documents are stored as JSON text; nothing queries inside them.

**Consequences.**
- `bin/dev` is the whole setup.
- Rails 8 opens SQLite transactions as `IMMEDIATE`, so SQLite serialises every writer. The concurrency tests (four saves on one revision, two threads submitting 25 operations each) therefore prove the outcome, not the row lock: they would pass without `lock!`. The row-lock path on a server database is written but not exercised.
- One server process only. Broadcasts and the in-memory rate limits do not cross processes; several processes need a shared cable adapter and a shared store for the counters. The protocol does not change.

## ADR-004: Visible-only rendering, with every performance technique switchable

**Status:** Accepted

**Context.** With every node mounted, a 2,000-node diagram took 2.2 s to open and panning dropped frames (p95 117 ms). React Flow can skip elements outside the viewport, but it draws a connector only when both ends have measured handles, and export rasterises the DOM, so naive culling loses connectors to off-screen steps and off-screen steps in exports. I also wanted each technique to earn its place by measurement.

**Decision.**
- Above 200 nodes the canvas mounts only what is in view. Nodes never mounted get four static 1 × 1 handles at their side centres, so connectors to them still draw; export mounts everything while it captures. Find, layout, guides and compare read the document, never the DOM.
- A drag writes ephemeral positions only and the release commits one operation. The canvas root and flow layer are separate components, node bodies are memoized behind thin frames, handlers are stable, selectors are shallow, and no-op updates keep their references.
- Each technique has a query flag (`no-visible`, `no-guards`, `no-stable`, `no-batch`, `no-shallow`, `no-memo`) read once per page load. `npm run bench` measures every size with all on and with each one off.

**Consequences.**
- At 2,000 nodes the diagram opens in about 160 ms, a drag holds 60 fps and re-renders only the dragged node. Render counts are asserted in unit tests, so a regression fails CI even though the benchmark is not part of it.
- Zooming out is still slow: each tick mounts the nodes that come into view (zoom frame p95 83 to 100 ms). A simplified drawing at low zoom would be next; it is not built.
- Exporting a large diagram takes as long as opening it without culling.

## ADR-005: Versions are snapshots, compared and restored by stable key

**Status:** Accepted

**Context.** People need a history they can compare and restore, and a restore must be undoable and reach collaborators. Ids change whenever a version is copied, so matching by id would show every step of a copy as removed and added again. A version per operation would bury the useful ones under hundreds an hour.

**Decision.**
- `diagram_versions` rows are immutable snapshots of the stored document, numbered per diagram, of kind `created`, `manual`, `automatic` or `restore`. Versions are taken by hand, and automatically after 10 minutes of a person's editing time when the diagram changed; both the editor and `VersionCapture` skip duplicates.
- Every node and connector carries a stable key, equal to its id at creation and kept when a copy remaps ids. Compare matches by key and classifies by deep difference; references are compared through the keys they point at.
- A restore keeps the stored diagram as a "Before restoring vN" version, then builds one batch operation from the current document to the version and applies it like any edit: one undo step, submitted to the room or autosaved.

**Consequences.**
- A version compared with a copy of itself shows no differences.
- A collaborator's concurrent edit to something the version does not change survives the restore.
- The history is a set of meaningful points, not an audit of every edit; there is no per-edit scrubber.

## ADR-006: My own orthogonal router

**Status:** Accepted

**Context.** React Flow's smooth-step edge draws a good elbow when the target is ahead of the source and a bad one when it is behind: the line turns back through a step. It has no edited segments either, and people must be able to drag a segment and keep their route when steps move.

**Decision.** `routing/orthogonal.ts` re-implements the smooth-step point generation from a written description (20-unit stubs, a primary axis, one or two corners) and judges the result by what is visible: a route is clear when no segment crosses either of its two steps (other than along a stub) and both ends leave along their port normals. When it is not, `autoRoute` scores about 70 candidates with up to three corners along channel coordinates (the stubs, their midpoint, 20 units outside each box, the gap between the boxes) by crossings, wrong-way ends, bends and length. Once a segment is dragged, the route stores every vertex from stub to stub; `stepRoute` re-attaches both ends on every render, re-routes an end that would now double back, and a final pass inserts an elbow into any diagonal.

**Consequences.**
- Clear routes are identical to the library's (192 rendered paths compared); blocked ones go around both steps, which a property test checks over more than 200 random layouts and all 16 side pairs.
- An edited route can never be stale, because re-attachment runs on every render rather than on chosen events.
- The detour search runs only for blocked connectors, and only the two connected steps are obstacles: a route can still cross a third step.

## ADR-007: Alignment guides from a sorted, incrementally updated index

**Status:** Accepted

**Context.** Snapping to every step on every pointer frame is O(n) per frame. A radius in canvas units behaves differently at every zoom, picking the nearest guide fresh on each frame makes it flicker between near-equal candidates, and an index built at drag start goes stale when a collaborator moves a step mid-gesture.

**Decision.** `geometry/guides.ts` keeps six anchors per step (top, middle, bottom; left, centre, right) in two arrays sorted by value. A lookup is a binary search for the window p ± r plus a scan. The index is built once per gesture and only the steps whose objects changed are re-inserted. The radius is 8 screen pixels divided by the zoom; candidates are culled to the viewport and to the K nearest steps (K = 2); the previous frame's guide wins while it is still a candidate. Snapping rewrites drag and resize frames before they reach the store, and the guides are drawn on one canvas sized by the device pixel ratio.

**Consequences.**
- 1,000 steps index in a few milliseconds and each frame is a binary search.
- Snapping costs no extra render; only the two visible guides are reactive state.
- React Flow drags every selected node together, so "snap only to this step" is an explicit toggle rather than inferred from the selection.

## ADR-008: My own layered layout next to dagre, and no ELK

**Status:** Accepted

**Context.** Automatic layout should offer a fast engine and a careful one. ELK is the usual second engine, but its licence (EPL-2.0) is outside this project's permissive-only policy.

**Decision.** Every engine takes a flat graph of boxes and returns top-left corners; `layout/compound.ts` lays out groups bottom-up for any engine. dagre is the fast engine on the main thread. `layout/layered.ts` is mine, in the textbook phases: cycle removal, longest-path layering with dummy nodes, barycenter sweeps that keep the ordering with the fewest crossings (counted exactly in O(E log V)), and coordinate assignment by an order-preserving least-squares fit. It runs in a web worker; each run carries a request number and stale results are dropped. The manual arrangement is stored in the document's `layout` field, so "Manual" restores it and one undo reverts a layout.

**Consequences.**
- No copyleft dependency, and the engine has hand-checked tests (a tangled planar graph reaches zero crossings, random DAGs point down their ranks without overlaps).
- The document grows by one entry per node and connector while a layout is active.
- I own the quality of a layout algorithm instead of a mature library's.

## ADR-009: My own PDF writer

**Status:** Accepted

**Context.** Export needs PNG and paged PDF with clean page breaks and a page count that matches the file. jsPDF pulls an optional dependency under MPL-2.0 or Apache-2.0 and does far more than placing one image and a few text lines per page.

**Decision.** `html-to-image` 1.11.11 (MIT, no dependencies) rasterises the canvas, as in React Flow's "Download Image" example. `export/pdf.ts` writes PDF 1.4 itself: catalog, page tree, the standard Helvetica font, one JPEG per page and a byte-exact cross-reference table. `export/pagination.ts` treats each node as a unit, keeps blocks whole where they fit and breaks taller ones at their children, so pages never cut through a step when they can avoid it. One plan feeds the dialog's page count and every "Page n of N".

**Consequences.**
- 150 lines replace a large dependency, and an end-to-end test reads the downloaded PDF and finds exactly the announced number of pages.
- The diagram in a PDF is a JPEG image, so its text cannot be selected or searched.

## ADR-010: The reveal animation: a pure planner and one cancellable controller

**Status:** Accepted

**Context.** The preview can build a diagram up, steps fading in and connectors drawing from source to target. The common failures: a connector that arrives before its target, a dash offset in percent (resolved against the viewport, so long lines never finish), and timers that keep running after Skip or leaving the page.

**Decision.** Three layers. `reveal/order.ts` computes the order by a breadth-first walk in reading order, with groups as blocks. `reveal/timeline.ts` plans start times (100 ms stagger, 250 ms fade, 400 ms draw) and pulls each target forward so it is visible when its line arrives, keeping the total under 6 s. `reveal/controller.ts` runs the plan behind one `CancellationToken` that owns the single pending timer and every tracked Web Animation, and publishes a phase per element without touching the DOM. Each connector measures its own path with `getTotalLength()` and animates its dash pattern from that length.

**Consequences.**
- Skip, Replay, any interaction and unmount cancel everything; a test counts pending handles.
- A refetch updates the drawing without replaying.
- Reduced motion shows the final state at once.

## Smaller decisions

| Area | Decision | Why |
|---|---|---|
| Repo | Monorepo: `server/` Rails 8 API and `client/` Vite app, one `bin/dev`, one CI workflow | Same layout as my reservations demo, so one setup to learn |
| Repo | `json` gem pinned below 3.0 | Active Support 8.0 still passes options json 3 removed |
| Access | One `AccessPolicy` for GraphQL and the socket; other workspaces' ids are `NOT_FOUND` | One code path to audit, and ids cannot be probed |
| Access | Demo sign-in issues HMAC-signed, purpose-bound, 12-hour tokens; no passwords | Five fictional people; passwords would add nothing to the demo |
| Access | The socket takes the token in its URL, filtered from logs | Browsers cannot set headers on a WebSocket handshake |
| Access | Membership re-checked before every channel action; removal disconnects sockets | A removed member must not keep listening or writing |
| Document | One JSON document per diagram, validated on every save and after every operation | One row read or write per diagram, and the format can grow without table migrations |
| Document | Client-generated UUIDs, positions relative to the parent group, a `nextNumber` counter | References never break in a round trip; numbers are never reused |
| Document | Keyed by id in memory, parents first on disk, repair through stable keys on load | Constant-time lookups, and the canvas needs parents before children |
| Document | Operations that cannot apply are skipped and counted, never thrown | Replaying old operations over a newer document degrades gracefully |
| Document | `revision` is the save conflict token and the collaboration sequence number | One counter for the document's version, whatever wrote it |
| Document | View settings in their own column, saved by `updateViewSettings` | Saving a view never conflicts with someone editing nodes |
| Document | Server validates kind-specific node keys and connector keys when present | The client renders those keys directly |
| Persistence | Autosave 2 s after the last change (10 s max), rebases pending operations on a conflict | Two tabs merge field by field instead of overwriting each other |
| Persistence | Collaboration switch: off means autosave with the revision check, not a lease | Reuses a mechanism that already merges safely; no "Request control" flow to build |
| Editor | One zustand store per open diagram, split into slices; selection and gestures never in the document | Drag frames never reach peers or undo |
| Editor | Every gesture (drag, resize, rotate, text growth) is live fields until release, then one operation | One undo step and one message per gesture |
| Editor | Per-person undo from before/after records, reverted with a three-way rule | Undo never overwrites a collaborator's later edit |
| Editor | The editor route is lazy-loaded | The landing page and lists ship about a third less JavaScript |
| Editor | Copy and paste through clipboard events with id remapping and re-parenting | Pasted ids never collide; groups bring their children |
| Editor | Find through an incremental text index; the query is never a pattern | Off-screen steps are found, and "(a" cannot throw |
| Editor | Shape library uses browser drag and drop under a custom data type | Other drops are ignored; drop point via `screenToFlowPosition` |
| Editor | One floating selection toolbar on the topmost selected node | Quick spatial actions near the selection; precise fields stay in the panel |
| Editor | Properties panel edits absolute coordinates, applied after 200 ms | Steps in groups line up with steps outside; one operation per pause |
| Editor | Align and distribute against the selection bounds, CSS naming (justify horizontal) | Marquee selections have no reliable "key step" order |
| Nodes | One node shell configured by a kind table | A new kind is a table row and a body |
| Nodes | Shape outline, handle anchors and text wrapping from one vertex list | Text wraps inside a diamond and handles touch the drawn outline |
| Nodes | Lines store angle and length; the box is derived | 360 rotations of 1° return to the same box |
| Nodes | My own freehand outline instead of a stroke library | Preview and stored stroke match at any zoom, fully unit-tested |
| Nodes | Groups: children confined, Alt to leave, re-parent by drop point | Drag in and out in one operation that keeps the on-screen position |
| Nodes | Manual z-index in two bands: groups below edges, other nodes above | Group backgrounds sit under connectors, steps inside them on top |
| Nodes | Plain text with node-level formatting, `contenteditable="plaintext-only"` | No HTML ever reaches the server |
| Nodes | Auto height grows while editing; an explicit "fit" otherwise | No timers and no surprise shrinking |
| Connectors | All routing maths in pure modules with one entry point, `computeRoute` | Preview and final connector are the same path |
| Connectors | Point editing keeps a local draft, snaps in screen pixels, add-handle ids derived from neighbours | One commit per gesture; the handle under the pointer never remounts |
| Connectors | Drop zones before ports, multi-source connect, Space to sketch, a ghost step on empty canvas | No placeholder nodes in the document |
| Connectors | Labels stored as a fraction along the path, placed by projection | Labels stay on the route when steps move |
| Connectors | Markers in `currentColor`, dotted lines as zero-length round dashes | Hover colours the arrows; dots are round |
| Connectors | All connector controls in the properties panel; no travelling-token renderer | A connector without points already draws like the library's plain edges |
| Viewing | View commands are pure functions; the opening view is applied once, nothing fits automatically | The view never jumps after a refetch |
| Viewing | Pan or scroll navigation per member with a workspace default; scrollbars from viewport algebra | People choose how the wheel behaves; bars sized by the visible fraction |
| Viewing | One read-only preview surface, fetched again on focus | Same renderers as the editor; follows saved edits |
| Collaboration | One pure state machine owns connecting, joining, gaps and backoff; Action Cable's own reconnect is stopped | Every path, timeout and backoff value is testable without a socket |
| Collaboration | Presence in canvas coordinates, drawn in React Flow's `ViewportPortal` with one counter-scaled transform | Cursors land on the same spot at any pan and zoom |
| Collaboration | Member colours from a hash of the member id, lightness adjusted for 3:1 contrast on both themes | Stable per person and readable; tag text at least 4.5:1 |
| Collaboration | Shared operation cases plus an in-memory room in client tests | Both appliers stay in step; interleavings are tested without a browser |
| History | Version copies remap every reference through an id map and keep stable keys | Copies validate and still line up in compare |
| History | Version endpoints use keyset pages; every id checked; viewers read only | No repeated rows while someone saves; no cross-tenant compare |
| History | History lives in the side column and a full-screen compare dialog | The canvas never changes size when the panel opens |
| Security | Headers on both apps; in-process throttles for sign-in (20 a minute per address) and presence (60 a second per member) | Rails' `rate_limit` would limit the whole GraphQL endpoint, and presence has no controller |
| Security | Production refuses to boot with a missing, short or placeholder `SECRET_KEY_BASE` | Copying `.env.example` must not make tokens forgeable |
| Security | Runtime packages free of advisories; dev-tooling major upgrades deferred | The dev tools never ship |
| Security | Licences audited from the lockfile and gemspecs; gems checked against OSV | `bundler-audit` needs a git checkout of its database and is GPL-3.0 |
| Landing | The guided tour is data rendered as a stepper | Works before sign-in and cannot drift from its test |
