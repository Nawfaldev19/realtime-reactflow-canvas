# Real-time collaboration

## What it does

Several people edit one diagram at once. Each sees the others' changes as soon as the server has stored them, live cursors with name tags, and a badge on the step someone has selected or is editing. Every copy converges to the same document, nothing is silently lost, the editor keeps working offline, and undo reverts only your own changes. An owner can switch collaboration off for a diagram, which returns everyone to autosave.

Decisions: [ADR-001](../DECISIONS.md#adr-001-a-server-ordered-operation-log-instead-of-a-crdt) (why a server-ordered log rather than a CRDT) and [ADR-002](../DECISIONS.md#adr-002-the-server-mints-collaboration-sessions-and-a-signed-token-resumes-them) (sessions).

## How it works

```mermaid
sequenceDiagram
    participant A as Ada's tab
    participant R as DiagramChannel
    participant S as OperationSubmit
    participant B as Ben's tab
    A->>A: apply locally, queue as pending (clientOpId 7)
    A->>R: submit {clientOpId: 7, op}
    R->>S: member, server-minted session, clientOpId, op
    S->>S: lock row; role, switch, repeat?; apply; validate; revision 42; log
    R-->>A: op {seq: 42, sessionId, clientOpId: 7, op}
    R-->>B: op {seq: 42, sessionId, clientOpId: 7, op}
    A->>A: own echo: confirmed += op, pending −= 7
    B->>B: confirmed += op, visible = confirmed + pending replayed
```

**Server.** `DiagramChannel` (`server/app/channels/diagram_channel.rb`) authenticates the socket with the same signed token as the API, checks membership on subscribe and before every action, and mints the session id. `OperationSubmit` is the only writer of a collaborative diagram: in one transaction it re-reads the role, checks the switch, refuses a repeat, applies the operation with `OperationApplier`, validates the whole document, increments the revision and logs the operation. The broadcast carries the full operation, after the commit. Whole-document saves are refused while collaboration is on.

**Client.** `client/src/collab/` holds the pure parts:

| Module | Role |
|---|---|
| `protocol.ts` | Message types; operation encode and decode, mirroring the server's shape check |
| `sequencer.ts` | Releases operations strictly in sequence order, drops repeats, holds early arrivals |
| `reconcile.ts` | Confirmed copy + pending queue = visible copy; echoes, remote operations, snapshots, refusals |
| `syncMachine.ts` | `(state, event) → (state, effects)` over connecting, joining, live, offline, standby, rejected |
| `presence.ts`, `colors.ts`, `coordinates.ts` | Roster and 20 Hz throttle, member colours, canvas coordinates |
| `client.ts`, `cable.ts` | Run the machine's effects against `@rails/actioncable` and the editor store |

**Messages.** The client sends `join`, `submit` and `presence`. The server sends `op` to everyone; `sync` to a joining tab (missed operations or a snapshot, its session id and resume token); `ack` for a re-send it already stored; `rejected` with a code; and `presence`, `collaboration` and `versions` announcements.

**Ordering and gaps.** Broadcasts can arrive late, twice or not at all. The sequencer waits one second for a missing number, then rejoins from the last applied one; more than 200 held operations rejoin at once. The server answers from the log of the last 2,000 operations, or with a snapshot. After a snapshot the client re-sends everything pending and the server acknowledges what it already has.

**Reconnecting.** Backoff is `min(30 s, 0.5 s × 2ⁿ)` with ±20% jitter; the browser's `online` event and a tab shown again after 5 minutes away retry at once. Action Cable's own reconnect monitor is stopped so only the state machine decides. The status reads "Offline – changes queued", then "Syncing…", then "Saved".

**Presence.** Pointers travel in diagram units, `flow = (screen − pane origin − pan) / zoom`, so a cursor sits on the same spot at any pan and zoom. Cursors, tags and badges render inside React Flow's `ViewportPortal` with one transform, `translate(x, y) scale(1 / zoom)`, so they keep their pixel size. Badges sit at the node's absolute corner. A member's colour is a hue from the FNV-1a hash of their id, with lightness moved just far enough for 3:1 contrast against both canvas themes; tag text is black or white, at least 4.5:1. The server attaches the sender's identity and relays at most 60 presence messages a second per member.

## Edge cases

| Case | What happens |
|---|---|
| Two people change different fields of one step | Both survive. |
| Two people change the same field | The one the server ordered last wins. |
| Ada moves a step, Ben then edits its text, Ada presses undo | The step moves back; Ben's text stays. Undo is a new operation built with a three-way rule. |
| A broadcast is lost or arrives out of order | Held, reordered, or fetched again on a rejoin. |
| A re-sent operation was already stored | `ack`; it leaves the pending queue without being applied twice. |
| A refused operation (invalid, too large, role) | Leaves the queue; the visible copy is rebuilt without it and the person is told. |
| A malformed operation or a server error | `rejected` with a reason, never an exception in the channel. |
| A viewer submits by hand | `FORBIDDEN`; viewers watch and appear in presence. |
| A member is removed or demoted while connected | Their sockets are disconnected; the role is read again for every operation. |
| Another member joins with your session id | Ignored: the server minted yours, and repeats are keyed by member too. |
| Collaboration switched off mid-edit | Pending operations stay pending and autosave saves them. |
| A restore of a very large diagram | One operation over 256 KB is refused with a notice; it works with collaboration off. |

## Tests

- `client/src/collab/*.test.ts`: sequencer arrival orders (property test), every state-machine transition, reconciliation, colour contrast over 3,000 ids, coordinate round trips.
- `client/src/collab/client.test.ts` against an in-memory room: three clients with random concurrent edits and shuffled delivery converge; offline periods; resume tokens; a member claiming another's session.
- The same 22 operation cases on both appliers (`sharedCases.test.ts`, `operation_applier_test.rb`).
- `diagram_channel_test.rb` (sessions, session reuse, malformed changes, viewers, presence limits, removed members) and `collaboration_convergence_test.rb` (two threads, 25 operations each, stored document equals the broadcast stream).
- `client/e2e/collaboration.spec.ts`: two real browsers, offline resync both ways, forged submits and token-less sockets refused, the switch.

## Limits

- Merging is per field. Simultaneous typing in one note keeps the later text; character-level merging would need a text CRDT.
- Peers see a drag when it ends, not while it happens.
- Collaboration off means autosave, not a single-editor lease.
- One server process: the cable adapter and rate limits are in memory ([ADR-003](../DECISIONS.md#adr-003-sqlite-and-a-single-process-cable-adapter)).
