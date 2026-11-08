# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-21

### Added

- An animated README hero (`docs/hero.gif`): two browser windows, one editing and one following live. `npm run record:hero` records both windows with Chromium's screencast and encodes the GIF with `gifenc` and `pngjs` (MIT, development only).

### Security

- The server mints every collaboration session id and ignores one sent by the client; re-sent changes are recognised by member, session and change id together, so one member can no longer suppress or acknowledge another's changes. A reconnecting tab keeps its session with a signed resume token that is never shared in presence.
- Production refuses to boot when `SECRET_KEY_BASE` is missing, shorter than 64 characters or the `.env.example` placeholder.
- Collaboration sockets re-check membership before every action; removing a member or dropping them to viewer disconnects their sockets.
- The presence rate limit counts per member instead of per subscription.

### Fixed

- A malformed operation (for example a non-numeric `z` or position, an over-long string or an unknown kind) is rejected with a reason instead of raising in the channel; unexpected channel errors are logged and answered, so the client stops re-sending the change.

### Changed

- The editor store is split into slices (document, gestures, connectors, collaboration, view) composed into the same store; its public API is unchanged.
- Prettier 3.3.3 formats the client (`npm run format`, checked in CI); RuboCop's line limit is 140.
- The benchmark writes `docs/benchmarks/benchmark-results.{md,json}`.
- Documentation rewritten and cut to about a third of its length: a shorter README, ten decision records plus a table of smaller decisions, one page per feature (the collaboration protocol and the performance method merged into their feature pages), and shorter architecture, security, testing and reference pages.
- The client package version follows the release (1.1.0).

## [1.0.0] - 2026-10-18

### Added

- Rails 8 GraphQL API with workspaces, members, memberships (owner, editor, viewer), diagrams stored as one validated JSON document with a revision counter, and immutable diagram versions; demo sign-in with signed, expiring tokens; tenant isolation through one access policy.
- React and TypeScript client: landing page with a guided tour of the hero features, sign-in picker, workspace switcher, diagram list, editor, read-only preview, light and dark themes.
- Nine node kinds: step, decision, start/end, sticky note, text label, shapes (diamond, hexagon, circle, triangle, parallelogram, cylinder) with text wrapped inside the outline, line nodes with drift-free rotation and cardinal snapping, freehand sketches, and nested groups with drag-in and Alt-drag-out.
- Editable connectors in four route styles (polyline, Catmull-Rom spline, Bézier-flavoured spline, orthogonal step) with control points, add handles, screen-pixel snapping and keyboard editing; orthogonal routes with editable segments that re-attach when steps move; floating connectors; drop-to-create, multi-source connections, sketched routes, sliding labels, markers, dash styles and marching ants.
- Editor tools: alignment guides from a sorted, incrementally updated index; selection toolbar (align, justify, distribute, group, line tools); two layout engines (dagre and our own layered layout in a web worker) with the manual arrangement kept; per-person undo and redo; copy, paste and duplicate with id remapping; find over the document; a shape library.
- Viewing: opening-view modes (fit width at the top, fit all, custom zoom, saved view), pan or scroll navigation per member with a workspace default, pan bounds and custom scrollbars, the build-up reveal animation with Skip and Replay, and PNG and paged PDF export with our own PDF writer.
- Real-time collaboration over Action Cable: server-ordered operations, confirmed copy plus pending queue on the client, gap detection and resync, offline editing, live cursors in canvas coordinates, name tags, "editing" badges, member colours with guaranteed contrast, and a per-diagram collaboration switch.
- Version history: manual and periodic versions, a key-matched visual compare (overlay or side by side), restore as one undoable operation, and copies with every reference remapped.
- Performance work for 500 to 2,000 nodes: visible-only rendering, no-op guards, stable callbacks, one operation per drag, shallow selectors and memoized node content, each switchable for measurement; a stress page and a Playwright benchmark.
- Security headers on the API and on the production web build (content security policy, `frame-ancestors 'none'`, `nosniff`), a sign-in rate limit per client address and a presence rate limit per socket subscription.
- Audit scripts: `scripts/license-audit.mjs` (every npm package and gem) and `scripts/gem-advisories.mjs` (gems against the OSV database), both run in CI with their own tests.
- Test suites: Minitest (unit, integration, Action Cable, threaded concurrency and convergence), Vitest with Testing Library (unit, property-style, component, render-count tests), shared operation cases run by both, and Playwright end-to-end tests including two-browser collaboration and the production build under its content security policy.
- One-command start (`bin/dev`), GitHub Actions CI, a scripted README screenshot (`npm run screenshot`), and documentation: architecture, decisions, one page per hero feature, collaboration, performance, testing, security, lessons, references.

### Security

- React Router upgraded from 6 to 7.18.4 and `lodash` overridden to 4.18.1, clearing every advisory in the shipped bundle (`npm audit --omit=dev` reports 0). Remaining advisories are in development-only tooling and are listed in [docs/SECURITY.md](docs/SECURITY.md).

### Known issues

- Zooming out over a very large diagram still drops frames (zoom frame p95 83 to 100 ms at 500 to 2,000 nodes); see [docs/features/performance.md](docs/features/performance.md).
