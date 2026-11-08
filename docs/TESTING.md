# Testing

Each rule is tested with the cheapest tool that can prove it, and every test checks an observable outcome (a returned value, a stored document, a rendered element, a broadcast, a header), not that a function was called.

| Layer | Tool | What it proves |
|---|---|---|
| Algorithms (`client/src/{document,geometry,routing,layout,viewport,reveal,collab,versions}`) | Vitest | Hand-computed values, edge cases, and property tests with a seeded generator: routes stay orthogonal, the guide index equals a rebuild, every node is revealed once, three clients converge |
| Editor state and components | Vitest, Testing Library | One operation per gesture, per-person undo, what a person sees, queried by role and accessible name |
| Render counts | Vitest | Exact renders per drag frame and per release; guards; visible-only mounting |
| Collaboration protocol | Vitest against an in-memory room | The channel's rules with controlled delivery order, drops and reconnects |
| Shared operation rules | Vitest and Minitest | The same 22 cases against the TypeScript and Ruby appliers |
| Server | Minitest, Action Cable test cases | Validation, saving, ordering, versions, tenant isolation with ids from other workspaces, the socket, presence limits, headers |
| Concurrency | Minitest with real threads | Four saves on one revision: one wins. Two threads submitting 25 operations each: the stored document equals the broadcast stream in order |
| End to end | Playwright 1.49.1, Chromium | Real browsers against both apps and a freshly seeded database, two browsers editing together, the production build under its content security policy |

## Results (21 October 2026)

| Suite | Command | Result |
|---|---|---|
| Server | `cd server && bin/rails test` | 235 runs, 970 assertions, 0 failures; 99% lines, 96% branches |
| Client | `cd client && npm run test:coverage` | 1,282 tests in 131 files, all passing; 98% lines |
| End to end | `cd client && npm run test:e2e` | 44 tests in 15 files, all passing (about 5 minutes) |
| Audit scripts | `node --test scripts/` | 4 tests, all passing |
| Lint and types | `bundle exec rubocop`, `npm run lint`, `npm run typecheck`, `npm run format:check` | No offences, no warnings, no errors |

SimpleCov fails the server run below 95% lines or 85% branches. The client fails below 80% overall, and below 90% on each algorithm folder, the export pagination, plan and PDF modules, the autosave controller, and the editor store, its slices and its other logic files.

Under heavy machine load (a load average above 20) a few slow component tests, such as the toolbar and version panel tests, can exceed Vitest's 5-second default timeout; they pass when rerun, and full runs at normal load pass. Raising those tests' timeouts is an open item.

Each [feature page](features/) lists the tests that prove it.

## Known gaps

- **Concurrency is tested on SQLite**, whose writer lock serialises everything, so the threaded tests would pass without the row lock. The server-database path is not exercised ([ADR-003](DECISIONS.md#adr-003-sqlite-and-a-single-process-cable-adapter)).
- **One browser engine.** End-to-end tests run in Chromium only.
- **Export capture** (`client/src/export/capture.ts`) needs a real DOM to rasterise; it is covered by the end-to-end export tests, not by unit tests.
- **Timing is tested with manual clocks** (reveal, autosave, presence, backoff); the real-time feel is covered only end to end and by the benchmark, which is not in CI.
- **No automated accessibility scanner**, because the common engine is MPL-2.0. Role-based queries, ARIA assertions, a keyboard-only walk through the landing tour and colour-contrast tests cover what they can.
- **No visual regression tests.** The screenshot and the hero animation are recorded by scripts, not compared.
- **The gem advisory check needs network access** to the OSV API.
