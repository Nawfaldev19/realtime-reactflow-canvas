# Security

What the demo protects, how, and what it knowingly leaves out.

**Actors:** an anonymous visitor; a viewer, editor or owner of a workspace; a member of two workspaces with different roles; a hostile client with a valid token sending hand-crafted GraphQL and socket messages; another website the member visits while signed in.

## Threats and mitigations

| Threat | Mitigation | Where |
|---|---|---|
| Forged or tampered token | HMAC-signed with `secret_key_base`, purpose-bound, 12-hour expiry; the member is looked up on every request and handshake | `server/app/services/auth_token.rb` |
| Placeholder secret in production | Boot fails when `SECRET_KEY_BASE` is missing, under 64 characters or the `.env.example` value | `server/lib/secret_key_check.rb` |
| Token in logs | `token`, `password` and `secret` parameters filtered, the socket's `?token=` included | `filter_parameter_logging.rb` |
| Scripted sign-ins | 20 demo sign-ins a minute per client address (`SIGN_IN_LIMIT_PER_MINUTE`), then `RATE_LIMITED` | `throttle.rb`, `sign_in_as_demo.rb` |
| Reading another workspace's data by id | Every resolver goes through `AccessPolicy`; other workspaces' records are `NOT_FOUND`, so ids cannot be probed; compare checks every version id | `access_policy.rb`, `tenant_isolation_test.rb` |
| A viewer writing | Every mutation that changes data needs owner or editor; every submitted operation re-reads the role in its transaction | `access_guards.rb`, `operation_submit.rb` |
| A removed or demoted member keeps a socket | Membership checked before every channel action; removal or demotion disconnects their sockets | `diagram_channel.rb`, `membership.rb` |
| A socket without a token, or into another workspace's room | Handshake refused; subscribing checks membership | `application_cable/connection.rb`, `diagram_channel.rb` |
| Taking over another editor's session | Session ids minted by the server; repeats keyed by member, session and change id; resume tokens signed, bound to member and diagram, never in presence ([ADR-002](DECISIONS.md#adr-002-the-server-mints-collaboration-sessions-and-a-signed-token-resumes-them)) | `diagram_channel.rb`, `session_resume.rb` |
| Impersonation or flooding in presence | Identity attached by the server; 60 messages a second per member across all their subscriptions | `DiagramChannel` |
| Overwriting a live diagram, or a stale save | Whole-document saves refused while collaborating; otherwise a revision check under a row lock | `diagram_save.rb` |
| Malformed or malicious documents and operations | Validated on every save and after every operation: known kinds, identifier ids, finite geometry, parents that exist without cycles, edges with both ends, kind-specific keys. Limits: 2 MB per document, 256 KB per operation, 8 levels of batches, 20,000 changes, 5,000 nodes, 10,000 edges. A malformed operation is `rejected`, never an exception | `diagram_document.rb`, `operation_shape.rb`, content rules |
| Injected markup | Plain text only; React escapes everything; search highlights are built as elements, never `innerHTML` | `client/src/document/search.ts` |
| Expensive queries | `max_depth 10`, `max_complexity 500`, version pages of at most 50 | `canvas_schema.rb` |
| Script injection, clickjacking, sniffing | Production web build: scripts and workers only from its own origin, no inline script or `eval`, `frame-ancestors 'none'`, `nosniff`. API: `default-src 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` | `client/src/security/headers.ts`, `server/config/application.rb` |
| Cross-site requests | CORS allows only the web origins and `POST` on `/graphql`; tokens travel in a header, not a cookie | `cors.rb` |
| Known-vulnerable dependencies | CI runs `npm audit --omit=dev`, the gem check against OSV and the licence audit | `.github/workflows/ci.yml` |

Each row is covered by server, client or end-to-end tests; `client/e2e/security.spec.ts` runs the production build under its policy and reports no violation.

## Dependency audit (21 October 2026)

| Check | Result |
|---|---|
| `npm audit --omit=dev` | 0 vulnerabilities |
| `node scripts/gem-advisories.mjs` | 85 gems, 0 advisories |
| `node scripts/license-audit.mjs` | 795 packages, 0 outside the policy, 1 explained exception |
| `npm audit` including development tooling | 40 advisories, all in development-only packages |

The development advisories are in Vite 5 and esbuild (dev-server request handling; it listens on localhost only and is never deployed), Vitest 2 (its UI server, which is never started), the GraphQL Code Generator's dependency tree (it only reads my own schema and source globs) and Playwright 1.49.1 (browser downloads; the browsers here are a local copy). Each fix is a major-version migration (Vite 8, Vitest 4, Code Generator 7, Playwright 1.55), which I have deferred rather than mixed into feature work. React Router 6, the only advisory in the shipped bundle, was upgraded to 7.18.4.

## Known limits

- **Anyone can sign in as anyone.** The demo picker has no passwords; a real deployment needs an identity provider.
- **The token lives in `localStorage`** and cannot be revoked before it expires. An `HttpOnly` cookie or a server-side session would be safer.
- **The socket token is in the URL.** It is filtered from Rails logs, but a proxy could log it; a short-lived socket ticket would avoid that.
- **Throttles are per process.** Behind a proxy, Rails must trust it so `remote_ip` is the client's address.
- **No request-body limit before parsing**; a production proxy should cap bodies.
- **`style-src 'unsafe-inline'`**, because React Flow positions elements with style attributes.
- **The dev server sends no security headers** (hot reload needs inline scripts); `vite preview` and a production host must.
- **`demoMembers` is public by design**, so the sign-in picker can list the fictional people.
