# Lessons

What building this taught me, including the mistakes.

**An identifier that guards correctness must come from whoever enforces it.** In 1.0.0 the client chose its collaboration session id, and the server de-duplicated re-sent changes by session and change id. Session ids were visible to every peer in presence, so another editor could reuse one and make someone's real change look like a repeat: acknowledged, dropped, never applied, while their screen said "Saved". Tests passed because every test client behaved. The fix was small (the server mints the id, the member is part of the key, a signed token resumes a session), and the lesson is the threat model I now apply first: which values does a hostile client choose, and what does the server trust them for? ([ADR-002](DECISIONS.md#adr-002-the-server-mints-collaboration-sessions-and-a-signed-token-resumes-them))

**Validate the whole shape before anything reads it.** The operation check looked at ids only, and a later step read `z` as a number. A non-numeric `z` raised inside the channel, the client never got an answer, and it re-sent the same change on every reconnect. Two changes fixed it: the shape check now covers every field of an added entity, and the channel answers any unexpected error with `rejected`, so a client always learns that a change is dead.

**A green concurrency test can prove the database, not the code.** SQLite serialises every writer, so my threaded tests (four saves on one revision, two threads submitting operations) would pass with the row lock deleted. They check the outcome that matters, one winner and a consistent log, but not the lock itself. I say so in [TESTING.md](TESTING.md) rather than let the numbers imply more.

**Measure each optimisation by turning it off.** Memoization is the usual first advice for React Flow, but on this editor the benchmark ranked it low: visible-only rendering took a 2,000-node open from 2.2 s to 160 ms, while memoized node bodies and shallow selectors changed render counts but not times on a one-node drag. Putting every technique behind a switch is what made that visible, and asserting render counts in unit tests turned the result into something CI can hold.

**Derive state from current inputs, not from events.** Edited connector routes and presence badges are derived from where the steps are now. Updating them only "when a step moves" goes stale the moment something else moves a step: a collaborator, an undo, a layout. Re-attaching routes and re-placing badges on every render, and making that cheap, removes the whole class of stale-route bugs. The one deliberate exception is the opening view, applied exactly once so that nothing moves the view behind someone's back.

**Write down fewer decisions, better.** I recorded 71 decisions while building. Most were feature notes. Ten of them actually shaped the system; the rest now fit in a table, one line each.
