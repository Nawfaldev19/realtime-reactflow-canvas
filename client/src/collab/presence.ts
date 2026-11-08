import type { Point } from "../document/types";
import { memberColor } from "./colors";
import type { PresenceMessage } from "./protocol";

// Who else is in the diagram: one entry per browser tab (session), never
// persisted. Presence messages carry the identity the server attached, so a
// peer cannot pose as someone else. A tab's own session is never listed.

/** Tabs re-send their presence this often while open, so idle peers do not expire. */
export const HEARTBEAT_MS = 10_000;
/** A cursor fades after this long without movement… */
export const STALE_MS = 10_000;
/** …and its entry is dropped after this long without any message (a tab that vanished without saying goodbye). */
export const EXPIRE_MS = 30_000;
/** Presence updates are sent at most this often (20 Hz). */
export const PRESENCE_INTERVAL_MS = 50;

export interface Peer {
  readonly sessionId: string;
  readonly memberId: string;
  readonly name: string;
  readonly color: string;
  readonly text: string;
  /** In canvas coordinates; null while the pointer is outside the canvas. */
  readonly cursor: Point | null;
  /** The node the peer has selected or is editing. */
  readonly nodeId: string | null;
  readonly editing: boolean;
  /** Join order, for the avatar list. */
  readonly order: number;
  /** The last message of any kind (tabs re-send their presence every few seconds while open). */
  readonly updatedAt: number;
  /** The last time the cursor moved. */
  readonly movedAt: number;
}

export interface Roster {
  readonly peers: Readonly<Record<string, Peer>>;
  readonly nextOrder: number;
}

export const EMPTY_ROSTER: Roster = { peers: {}, nextOrder: 0 };

const sameCursor = (a: Point | null, b: Point | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);

/** Applies one presence message received at `now`. */
export function applyPresence(roster: Roster, message: PresenceMessage, selfSessionId: string, now: number): Roster {
  if (message.sessionId === selfSessionId) return roster;
  const { [message.sessionId]: existing, ...others } = roster.peers;
  if (message.event === "leave") return existing ? { ...roster, peers: others } : roster;
  const colors = existing ?? memberColor(message.memberId);
  const peer: Peer = {
    sessionId: message.sessionId,
    memberId: message.memberId,
    name: message.name,
    color: colors.color,
    text: colors.text,
    cursor: message.cursor,
    nodeId: message.nodeId,
    editing: message.editing,
    order: existing?.order ?? roster.nextOrder,
    updatedAt: now,
    movedAt: existing && sameCursor(existing.cursor, message.cursor) ? existing.movedAt : now,
  };
  return {
    peers: { ...roster.peers, [peer.sessionId]: peer },
    nextOrder: existing ? roster.nextOrder : roster.nextOrder + 1,
  };
}

/** Drops entries silent for longer than EXPIRE_MS. */
export function expire(roster: Roster, now: number): Roster {
  const kept = Object.values(roster.peers).filter((peer) => now - peer.updatedAt <= EXPIRE_MS);
  return kept.length === Object.keys(roster.peers).length
    ? roster
    : { ...roster, peers: Object.fromEntries(kept.map((peer) => [peer.sessionId, peer])) };
}

/** A cursor that has not moved for STALE_MS fades out. */
export const isStale = (peer: Peer, now: number): boolean => now - peer.movedAt > STALE_MS;

/** Peers in join order. */
export const peersInOrder = (roster: Roster): Peer[] => Object.values(roster.peers).sort((a, b) => a.order - b.order);

export interface Avatar {
  readonly memberId: string;
  readonly name: string;
  readonly color: string;
  readonly text: string;
  /** Open tabs of this member (the same person in two tabs shows one avatar with a count). */
  readonly sessions: number;
  readonly self: boolean;
  /** Nodes the member has selected, in this member's tabs. */
  readonly nodeIds: readonly string[];
}

/** The header's avatars: the current member first, then others in join order, one per member. */
export function avatarsOf(roster: Roster, self: { memberId: string; name: string }): Avatar[] {
  const own = memberColor(self.memberId);
  const avatars = new Map<string, Avatar>([
    [self.memberId, { memberId: self.memberId, name: self.name, ...own, sessions: 1, self: true, nodeIds: [] }],
  ]);
  for (const peer of peersInOrder(roster)) {
    const current = avatars.get(peer.memberId);
    const nodeIds = peer.nodeId === null ? [] : [peer.nodeId];
    avatars.set(
      peer.memberId,
      current
        ? { ...current, sessions: current.sessions + 1, nodeIds: [...current.nodeIds, ...nodeIds] }
        : {
            memberId: peer.memberId,
            name: peer.name,
            color: peer.color,
            text: peer.text,
            sessions: 1,
            self: false,
            nodeIds,
          },
    );
  }
  return [...avatars.values()];
}

/** "Ada Okafor · Step 12", or just the name without a node. */
export function presenceLabel(name: string, nodeNumber: number | null): string {
  return nodeNumber === null ? name : `${name} · Step ${nodeNumber}`;
}

/**
 * Limits how often a value is sent: the first value goes at once, later ones
 * at most every `interval` ms (the latest wins), and `flush` sends a waiting
 * value immediately. Tests pass in their own timers.
 */
export class Throttle<T> {
  private waiting: { value: T } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly send: (value: T) => void,
    private readonly interval: number,
    private readonly clock: {
      now: () => number;
      setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
      clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
    },
  ) {}

  push(value: T): void {
    this.waiting = { value };
    const wait = this.lastSent + this.interval - this.clock.now();
    if (wait <= 0) this.flush();
    else
      this.timer ??= this.clock.setTimeout(() => {
        this.timer = null;
        this.flush();
      }, wait);
  }

  flush(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    const next = this.waiting;
    this.waiting = null;
    if (!next) return;
    this.lastSent = this.clock.now();
    this.send(next.value);
  }

  cancel(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.waiting = null;
  }
}
