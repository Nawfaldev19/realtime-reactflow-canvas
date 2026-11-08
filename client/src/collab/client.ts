import { createStore, type StoreApi } from "zustand/vanilla";
import type { Point } from "../document/types";
import type { EditorStoreApi } from "../editor/store";
import type { Clock } from "../persistence/autosave";
import {
  encodeOperation,
  parseServerMessage,
  type Identity,
  type OpMessage,
  type PresenceRequest,
  type ServerMessage,
  type SyncMessage,
} from "./protocol";
import {
  applyPresence,
  EMPTY_ROSTER,
  expire,
  HEARTBEAT_MS,
  PRESENCE_INTERVAL_MS,
  Throttle,
  type Roster,
} from "./presence";
import { clientOpIdOf } from "./reconcile";
import { offer, startSequencer, type OfferResult, type SequencerState } from "./sequencer";
import {
  DEFAULT_TIMING,
  IDLE,
  isCollaborating,
  syncStatusOf,
  transition,
  type SyncEffect,
  type SyncEvent,
  type SyncState,
  type Timing,
} from "./syncMachine";

// Runs one tab's collaboration session: the state machine (syncMachine.ts)
// decides, this class carries out its effects on the transport and the
// editor store. Framework-free; the transport and the clock are passed in, so
// the whole protocol is tested against an in-memory server.
//
// - Session: the server mints this tab's session id and returns it, with a
//   signed resume token, in every sync reply. The token goes back with the
//   next join, so a reconnect keeps the session and the server can recognise
//   a re-sent operation it already stored.
// - Local operations: the store applies them at once and queues them as
//   pending; while live they are submitted in order, each with its local
//   sequence number as the client operation id.
// - Server operations: put in sequence order (sequencer.ts) and reconciled
//   with the pending queue (reconcile.ts). While a join is in flight they are
//   held and replayed after the reply.
// - Presence: throttled to 20 Hz, re-sent every 10 s, kept in its own small
//   store so cursor movement never re-renders the diagram.

export interface TransportHandlers {
  connected(): void;
  disconnected(): void;
  rejected(): void;
  received(data: unknown): void;
}

export interface Transport {
  open(): void;
  close(): void;
  /** Sends an action; false when the socket is not open. */
  perform(action: "join" | "submit" | "presence", data: object): boolean;
  dispose(): void;
}

export type TransportFactory = (room: { diagramId: string }, handlers: TransportHandlers) => Transport;

export interface PresenceState {
  readonly self: Identity | null;
  readonly roster: Roster;
  /** Updated every second, for fading idle cursors. */
  readonly now: number;
}

export type PresenceStoreApi = StoreApi<PresenceState>;

export interface CollabClientOptions {
  readonly store: EditorStoreApi;
  readonly transport: TransportFactory;
  /** Runs before switching from autosave to collaboration (the autosave flush). */
  readonly beforeEnable?: () => Promise<void>;
  readonly clock?: Clock;
  readonly timing?: Partial<Timing>;
}

const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle);
  },
};

const TICK_MS = 1000;
const NO_PRESENCE: PresenceRequest = { cursor: null, nodeId: null, editing: false };

export class CollabClient {
  readonly presence: PresenceStoreApi;
  private readonly store: EditorStoreApi;
  private readonly transport: Transport;
  private readonly clock: Clock;
  private readonly timing: Timing;
  private readonly beforeEnable: () => Promise<void>;
  private readonly throttle: Throttle<PresenceRequest>;
  private machine: SyncState = IDLE;
  private sequencer: SequencerState = startSequencer(0);
  /** Operations that arrived while a join was in flight. */
  private inbox: OpMessage[] = [];
  /** Pending operations already submitted on this connection. */
  private readonly sent = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setTimeout> | null = null;
  private lastHeartbeat = 0;
  private current: PresenceRequest = NO_PRESENCE;
  private unsubscribe: (() => void) | null = null;
  private waiters: { resolve: () => void; handle: ReturnType<typeof setTimeout> }[] = [];
  /** The resume token of the last sync reply; kept in memory only. */
  private resumeToken: string | null = null;

  constructor({
    store,
    transport,
    beforeEnable = () => Promise.resolve(),
    clock = systemClock,
    timing = {},
  }: CollabClientOptions) {
    this.store = store;
    this.clock = clock;
    this.timing = { ...DEFAULT_TIMING, ...timing };
    this.beforeEnable = beforeEnable;
    this.presence = createStore<PresenceState>()(() => ({ self: null, roster: EMPTY_ROSTER, now: clock.now() }));
    this.throttle = new Throttle((value) => this.transport.perform("presence", value), PRESENCE_INTERVAL_MS, clock);
    const { diagramId } = store.getState();
    this.transport = transport(
      { diagramId: diagramId ?? "" },
      {
        connected: () => {
          this.dispatch({ type: "connected" });
        },
        disconnected: () => {
          this.dispatch({ type: "disconnected" });
        },
        rejected: () => {
          this.dispatch({ type: "rejected" });
        },
        received: (data) => {
          const message = parseServerMessage(data);
          if (message) this.receive(message);
        },
      },
    );
  }

  get state(): SyncState {
    return this.machine;
  }

  start(): void {
    this.unsubscribe = this.store.subscribe((next, previous) => {
      if (next.pending !== previous.pending) {
        this.sendPending();
        this.updateSaveStatus();
        this.settleWaiters();
      }
    });
    this.dispatch({ type: "start", enabled: this.store.getState().collaborationEnabled });
    this.tick();
  }

  stop(): void {
    this.dispatch({ type: "stop" });
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.throttle.cancel();
    if (this.ticker !== null) this.clock.clearTimeout(this.ticker);
    this.ticker = null;
    for (const waiter of this.waiters) {
      this.clock.clearTimeout(waiter.handle);
      waiter.resolve();
    }
    this.waiters = [];
    this.transport.dispose();
  }

  /** The tab was hidden for a long time, or the browser came back online: catch up now. */
  resume(): void {
    this.dispatch({ type: "resume" });
  }

  /** This tab's pointer in canvas coordinates, or null when it left the canvas. Throttled to 20 Hz. */
  setCursor(cursor: Point | null): void {
    this.current = { ...this.current, cursor };
    if (this.machine.kind === "live") this.throttle.push(this.current);
  }

  /** The node this tab has selected or is editing; sent at once. */
  setSelection(nodeId: string | null, editing: boolean): void {
    if (nodeId === this.current.nodeId && editing === this.current.editing) return;
    this.current = { ...this.current, nodeId, editing };
    this.sendPresenceNow();
  }

  /** Resolves once every pending operation is acknowledged, or after `timeoutMs`. */
  whenSynced(timeoutMs = 5000): Promise<void> {
    if (!this.store.getState().collaborating || this.store.getState().pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const waiter = {
        resolve,
        handle: this.clock.setTimeout(() => {
          this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
          resolve();
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  private settleWaiters() {
    if (this.store.getState().pending.length > 0) return;
    for (const waiter of this.waiters) {
      this.clock.clearTimeout(waiter.handle);
      waiter.resolve();
    }
    this.waiters = [];
  }

  private dispatch(event: SyncEvent) {
    const before = this.machine;
    const { state, effects } = transition(before, event, this.timing);
    this.machine = state;
    for (const effect of effects) this.run(effect);
    const editor = this.store.getState();
    editor.setSyncStatus(syncStatusOf(state));
    editor.setCollaborating(isCollaborating(state));
    if (state.kind === "live" && before.kind !== "live") this.sendPresenceNow();
    if (state.kind !== "live" && before.kind === "live") this.throttle.cancel();
    if (!isCollaborating(state) && Object.keys(this.presence.getState().roster.peers).length > 0)
      this.presence.setState({ roster: EMPTY_ROSTER });
    this.updateSaveStatus();
  }

  private run(effect: SyncEffect) {
    switch (effect.type) {
      case "open":
        this.transport.open();
        return;
      case "close":
        this.sent.clear();
        this.transport.close();
        return;
      case "join":
        this.inbox = [];
        this.sent.clear();
        this.transport.perform("join", {
          lastSeq: effect.fromScratch ? null : this.store.getState().revision,
          resume: this.resumeToken,
        });
        return;
      case "resendPending":
        this.sent.clear();
        this.sendPending();
        return;
      case "setTimer":
        this.clearTimer();
        this.timer = this.clock.setTimeout(() => {
          this.timer = null;
          this.dispatch({ type: "timeout" });
        }, effect.ms);
        return;
      case "clearTimer":
        this.clearTimer();
        return;
    }
  }

  private clearTimer() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private receive(message: ServerMessage) {
    switch (message.type) {
      case "sync":
        this.receiveSync(message);
        return;
      case "op":
        if (this.machine.kind === "joining") this.inbox.push(message);
        else if (this.machine.kind === "live") this.release(offer(this.sequencer, message));
        return;
      case "ack":
        this.forget(message.clientOpId);
        return;
      case "rejected":
        // The switch was turned off: the operation stays pending and autosave stores it.
        if (message.code === "COLLABORATION_OFF") return;
        if (this.forget(message.clientOpId)) {
          this.store
            .getState()
            .setCollabNotice({ kind: "refused", message: `A change could not be saved: ${message.message}` });
        }
        return;
      case "presence":
        this.receivePresence(message);
        return;
      case "collaboration":
        this.receiveSwitch(message.enabled, message.by);
        return;
      case "versions":
        this.store.getState().noteVersionSaved(message.number);
        return;
      case "error":
        this.store.getState().setCollabNotice({ kind: "refused", message: message.message });
        return;
    }
  }

  private receiveSync(message: SyncMessage) {
    if (this.machine.kind !== "joining") return;
    const editor = this.store.getState();
    this.resumeToken = message.resume;
    this.presence.setState({ self: message.you });
    editor.setCollaborationEnabled(message.enabled);
    if (message.enabled) {
      // The missed operations are matched against the session that sent them, before the reply's session takes over.
      if (message.mode === "snapshot") editor.receiveSnapshot(message.document, message.revision);
      else editor.receiveOps(message.ops.filter((op) => op.seq > editor.revision));
      editor.setSessionId(message.you.sessionId);
      this.sequencer = startSequencer(message.revision);
      const held = this.inbox;
      this.inbox = [];
      this.dispatch({ type: "synced", enabled: true });
      for (const op of held) this.release(offer(this.sequencer, op));
    } else {
      editor.setSessionId(message.you.sessionId);
      this.inbox = [];
      this.dispatch({ type: "synced", enabled: false });
    }
  }

  private release(result: OfferResult) {
    this.sequencer = result.state;
    if (result.ready.length > 0) this.store.getState().receiveOps(result.ready);
    if (result.overflow) this.dispatch({ type: "overflow" });
    else this.dispatch({ type: result.gap ? "gapOpened" : "gapClosed" });
  }

  /** Drops the pending operation with this client operation id; false when there is none. */
  private forget(clientOpId: string): boolean {
    const entry = this.store.getState().pending.find((candidate) => clientOpIdOf(candidate.seq) === clientOpId);
    if (!entry) return false;
    this.store.getState().dropPending(entry.seq);
    return true;
  }

  private receivePresence(message: Extract<ServerMessage, { type: "presence" }>) {
    if (!isCollaborating(this.machine)) return;
    const { sessionId } = this.store.getState();
    this.presence.setState({
      roster: applyPresence(this.presence.getState().roster, message, sessionId, this.clock.now()),
    });
    // A newcomer does not know who is here yet: everyone answers with their presence.
    if (message.event === "join" && message.sessionId !== sessionId) this.sendPresenceNow();
  }

  private receiveSwitch(enabled: boolean, by: string) {
    const editor = this.store.getState();
    if (editor.collaborationEnabled === enabled && isCollaborating(this.machine) === enabled) return;
    editor.setCollaborationEnabled(enabled);
    editor.setCollabNotice({
      kind: enabled ? "on" : "off",
      message: `Live collaboration turned ${enabled ? "on" : "off"} by ${by}`,
    });
    if (enabled) {
      void this.beforeEnable().then(() => {
        this.dispatch({ type: "enable" });
      });
    } else {
      this.dispatch({ type: "disable" });
    }
  }

  private sendPending() {
    if (this.machine.kind !== "live") return;
    for (const entry of this.store.getState().pending) {
      if (this.sent.has(entry.seq)) continue;
      if (!this.transport.perform("submit", { clientOpId: clientOpIdOf(entry.seq), op: encodeOperation(entry.op) }))
        return;
      this.sent.add(entry.seq);
    }
  }

  private sendPresenceNow() {
    if (this.machine.kind !== "live") return;
    this.lastHeartbeat = this.clock.now();
    this.throttle.push(this.current);
    this.throttle.flush();
  }

  private updateSaveStatus() {
    const editor = this.store.getState();
    const { kind } = editor.saveStatus;
    if (!editor.collaborating) {
      // Back to autosave: it reports from now on.
      if (kind === "syncing" || kind === "offline")
        editor.setSaveStatus(editor.pending.length > 0 ? { kind: "pending" } : { kind: "idle" });
      return;
    }
    const status = syncStatusOf(this.machine);
    if (status === "offline") {
      if (kind !== "offline") editor.setSaveStatus({ kind: "offline" });
    } else if (status !== "live") {
      if (kind !== "syncing") editor.setSaveStatus({ kind: "syncing" });
    } else if (editor.pending.length > 0) {
      if (kind !== "saving") editor.setSaveStatus({ kind: "saving" });
    } else if (kind === "saving" || kind === "syncing" || kind === "offline") {
      editor.setSaveStatus(kind === "saving" ? { kind: "saved", at: this.clock.now() } : { kind: "idle" });
    }
  }

  /** Once a second: fade and expire peers, and send the heartbeat. */
  private tick() {
    const now = this.clock.now();
    const { roster } = this.presence.getState();
    this.presence.setState({ now, roster: expire(roster, now) });
    if (this.machine.kind === "live" && now - this.lastHeartbeat >= HEARTBEAT_MS) this.sendPresenceNow();
    this.ticker = this.clock.setTimeout(() => {
      this.tick();
    }, TICK_MS);
  }
}
