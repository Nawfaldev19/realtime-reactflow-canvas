# Third-party notices

This project's own code is MIT licensed (see [LICENSE](LICENSE)). It depends on the open-source packages below, installed by Bundler and npm rather than copied into the repository. Only permissively licensed packages are used.

## How this list is checked

`node scripts/license-audit.mjs` reads every entry of `client/package-lock.json` (each records its declared license and whether it is a development dependency) and the installed gemspec of every gem in `server/Gemfile.lock`. A package passes when its license expression is satisfied by the allow-list (MIT, MIT-0, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, BlueOak-1.0.0, CC0-1.0, Unlicense, Python-2.0, and Ruby's own license); for "A OR B" one permitted option is enough. Anything else must be listed in the script with a reason, or the script fails. CI runs it on every push. `--list` prints every package with its license.

Result on 21 October 2026: **795 packages, 0 outside the policy, 1 explained exception.**

| Group | Packages | Licenses |
|---|---|---|
| Client runtime (shipped in the bundle) | 59 | MIT 47, ISC 9, BSD-3-Clause 2, 0BSD 1 |
| Client development (build, test, lint) | 651 | MIT 552, ISC 34, Apache-2.0 25, 0BSD 10, BSD-2-Clause 10, BSD-3-Clause 8, BlueOak-1.0.0 7, MIT-0 1, Python-2.0 1, CC-BY-4.0 1, MIT OR Apache-2.0 1, MIT OR CC0-1.0 1 |
| Server gems | 85 | MIT 55, Ruby OR BSD-2-Clause 20, Ruby 2, BSD-3-Clause 2, Apache-2.0 2, MIT OR Apache-2.0 1, MIT OR BSD-2-Clause 1, BSD-2-Clause OR Ruby 1, Ruby OR GPL-2.0-only 1 |

### Exceptions and choices

- **`caniuse-lite` (CC-BY-4.0), the one exception.** The browser-support dataset read by the build tooling (Browserslist). Development only; nothing from it is shipped in the app bundle.
- **`rdoc` (Ruby OR GPL-2.0-only).** Pulled in by Rails' console tooling; used under the Ruby license option.
- **Ruby's license** (`json`, `reline`, and the dual-licensed default gems) lets you redistribute under the 2-clause BSD license or Ruby's own permissive conditions.
- **Dual-licensed packages** (`marcel`, `nio4r`, `rbs`, `remedial`, `type-fest`) are used under their MIT or BSD option.
- **Not used:** ELK (EPL), jsPDF (pulls DOMPurify, MPL-2.0 or Apache-2.0, as an optional dependency; I wrote a small PDF writer instead, ADR-009), and the common accessibility scanner engine (MPL-2.0). `bundler-audit` (GPL-3.0) is not a dependency; gems are checked against the OSV database by `scripts/gem-advisories.mjs` instead.

## Client runtime (direct dependencies, from `client/package.json`)

| Package | License | Purpose |
|---|---|---|
| react, react-dom | MIT | UI library |
| react-router-dom (with react-router) | MIT | Routing |
| @xyflow/react (with @xyflow/system) | MIT | The diagram canvas (React Flow) |
| zustand | MIT | Editor state store |
| @apollo/client | MIT | GraphQL client and cache |
| graphql | MIT | GraphQL parsing |
| @rails/actioncable | MIT | Collaboration socket client |
| @dagrejs/dagre (with @dagrejs/graphlib) | MIT | The "Fast" layout engine |
| html-to-image | MIT | Rasterising the canvas for PNG and PDF export |
| lucide-react | ISC | Icons |

React Flow brings d3 modules (ISC; `d3-ease` BSD-3-Clause); `tslib` is 0BSD.

## Client development (direct dependencies)

| Package | License | Purpose |
|---|---|---|
| vite, @vitejs/plugin-react | MIT | Dev server and build |
| typescript | Apache-2.0 | Type checking |
| @graphql-codegen/cli, @graphql-codegen/client-preset | MIT | Generated GraphQL types |
| eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, globals | MIT | Linting |
| prettier | MIT | Code formatting |
| vitest, @vitest/coverage-v8 | MIT | Unit and component tests, coverage |
| @testing-library/react, @testing-library/user-event, @testing-library/jest-dom | MIT | Component testing |
| jsdom | MIT | DOM for tests |
| @playwright/test | Apache-2.0 | End-to-end tests, the benchmark and the README recordings |
| gifenc | MIT | Encoding the README animation (`client/scripts/record-hero.ts`) |
| pngjs, @types/pngjs | MIT | Decoding screencast frames for the README animation |
| @types/react, @types/react-dom, @types/node, @types/rails__actioncable | MIT | Type definitions |

## Server (direct dependencies, from `server/Gemfile`)

| Package | License | Purpose |
|---|---|---|
| rails (Action Cable included) | MIT | Web framework and websockets |
| graphql | MIT | GraphQL server |
| sqlite3 | BSD-3-Clause | Database driver |
| puma | BSD-3-Clause | HTTP server |
| rack-cors | MIT | CORS headers |
| json | Ruby | JSON encoding (pinned below 3.0 for Rails 8.0 compatibility) |
| rubocop, rubocop-rails, rubocop-minitest | MIT | Linting (development only) |
| simplecov | MIT | Coverage (test only) |

Action Cable's websocket gems (`websocket-driver`, `websocket-extensions`) are Apache-2.0.

## Fonts

Loaded at runtime from Google Fonts; not redistributed in this repository. Export embeds the Latin subsets into the exported image only.

| Font | License |
|---|---|
| Fraunces | SIL Open Font License 1.1 |
| Inter | SIL Open Font License 1.1 |
| JetBrains Mono | SIL Open Font License 1.1 |

## Icons, images and code adapted from documentation

- Icons: Lucide (ISC License).
- The favicon (`client/public/favicon.svg`), the README screenshot and the README animation are original to this project.
- Design tokens (`client/src/styles/tokens.css`) come from my earlier demo, inclusive-ui (MIT).
- Code adapted from React Flow's free examples and documentation (MIT) is credited in [docs/REFERENCES.md](docs/REFERENCES.md) and in a comment at the top of each adapted module.
