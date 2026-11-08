import { applyOperation } from "../document/operations";
import { parseDocument, serializeDocument } from "../document/serialize";
import type { DiagramDocument, DocumentState } from "../document/types";
import { decodeOperation, type OpMessage } from "../collab/protocol";
import type { Transport, TransportFactory, TransportHandlers } from "../collab/client";

// An in-memory stand-in for the server's DiagramChannel, with the same
// protocol and rules (it applies operations with applyOperation, which the
// shared cases prove equal to the server's OperationApplier). Like the
// server, it mints every session id, hands out resume tokens bound to the
// member, and recognises re-sent operations by member, session and client
// operation id. Messages travel
// as JSON, like on a socket. Nothing is delivered until the test says so, so
// tests decide the interleaving: deliver everything, deliver in a shuffled
// order, drop messages, or drop a socket.

interface Member {
  readonly memberId: string;
  readonly name: string;
  readonly canEdit?: boolean;
}

type Delivery =
  | { readonly socket: FakeSocket; readonly kind: "message"; readonly data: unknown }
  | { readonly socket: FakeSocket; readonly kind: "connected" | "disconnected" | "rejected" };

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

export class FakeSocket implements Transport {
  isOpen = false;
  disposed = false;
  /** Minted by the room on every subscribe; a join with a valid resume token restores the earlier one. */
  sessionId = "";
  /** The room has announced this subscription's session. */
  announced = false;

  constructor(
    private readonly room: FakeRoom,
    readonly member: Member,
    readonly handlers: TransportHandlers,
  ) {}

  open(): void {
    if (this.disposed) return;
    if (!this.room.online) {
      this.room.queue({ socket: this, kind: "disconnected" });
      return;
    }
    this.isOpen = true;
    this.room.subscribe(this);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.room.leave(this);
    this.room.queue({ socket: this, kind: "disconnected" });
  }

  perform(action: "join" | "submit" | "presence", data: object): boolean {
    if (!this.isOpen) return false;
    this.room.request(this, action, wire(data) as Record<string, unknown>);
    return true;
  }

  dispose(): void {
    this.close();
    this.disposed = true;
  }
}

export class FakeRoom {
  state: DocumentState;
  revision: number;
  enabled: boolean;
  online = true;
  readonly log: OpMessage[] = [];
  readonly sockets = new Set<FakeSocket>();
  readonly outbox: Delivery[] = [];
  /** Requests waiting for the server, in arrival order. */
  readonly requests: { socket: FakeSocket; action: string; data: Record<string, unknown> }[] = [];
  readonly submitted: unknown[] = [];
  /** Server-side validation of the resulting document: a message refuses the operation. */
  refuse: (op: unknown) => string | null = () => null;
  private readonly seen = new Map<string, number>();
  private sessions = 0;

  /** `document` is a stored document, parsed as the editor parses it. */
  constructor({ document, revision = 0, enabled = true }: { document: unknown; revision?: number; enabled?: boolean }) {
    this.state = parseDocument(document).state;
    this.revision = revision;
    this.enabled = enabled;
  }

  get document(): DiagramDocument {
    return serializeDocument(this.state);
  }

  transport(member: Member): TransportFactory {
    return (_room, handlers) => new FakeSocket(this, member, handlers);
  }

  queue(delivery: Delivery): void {
    this.outbox.push(delivery);
  }

  subscribe(socket: FakeSocket): void {
    this.sessions += 1;
    socket.sessionId = `session-${String(this.sessions)}`;
    socket.announced = false;
    this.sockets.add(socket);
    this.queue({ socket, kind: "connected" });
  }

  leave(socket: FakeSocket): void {
    if (!this.sockets.delete(socket) || !socket.announced) return;
    this.broadcast({
      type: "presence",
      event: "leave",
      ...this.identity(socket),
      cursor: null,
      nodeId: null,
      editing: false,
    });
  }

  /** The resume token the room hands out (the server signs it; the stand-in only binds it to the member). */
  static resumeToken(memberId: string, sessionId: string): string {
    return `resume:${memberId}:${sessionId}`;
  }

  request(socket: FakeSocket, action: string, data: Record<string, unknown>): void {
    this.requests.push({ socket, action, data });
  }

  /** The server handles every waiting request, in arrival order (or in the order `pick` chooses). */
  process(pick: (count: number) => number = () => 0): void {
    while (this.requests.length > 0) {
      const [request] = this.requests.splice(pick(this.requests.length), 1);
      if (request) this.handle(request.socket, request.action, request.data);
    }
  }

  /** Delivers waiting messages until none are left (handlers may cause more), in order or in the order `pick` chooses. */
  deliver(pick: (count: number) => number = () => 0): void {
    for (let guard = 0; this.outbox.length > 0 && guard < 100_000; guard += 1) {
      const [delivery] = this.outbox.splice(pick(this.outbox.length), 1);
      if (!delivery || delivery.socket.disposed) continue;
      if (delivery.kind === "message") delivery.socket.handlers.received(delivery.data);
      else delivery.socket.handlers[delivery.kind]();
    }
  }

  /** Processes requests and delivers replies until the room is quiet. */
  settle(): void {
    for (let guard = 0; (this.requests.length > 0 || this.outbox.length > 0) && guard < 1000; guard += 1) {
      this.process();
      this.deliver();
    }
  }

  /** The server drops a socket (as when it restarts). */
  drop(socket: FakeSocket): void {
    socket.close();
  }

  /** Changes the switch as the setCollaboration mutation does. */
  setEnabled(enabled: boolean, by = "Ada Okafor"): void {
    this.enabled = enabled;
    this.broadcast({ type: "collaboration", enabled, by });
  }

  /** Announces a saved version, as the version mutations do. */
  announceVersion(number: number, by = "Ben Lindqvist"): void {
    this.broadcast({ type: "versions", number, by });
  }

  /** Changes the stored document without an operation (a whole-document save while collaboration is off). */
  overwrite(document: DiagramDocument): void {
    this.state = parseDocument(document).state;
    this.revision += 1;
  }

  private identity(socket: FakeSocket) {
    return { sessionId: socket.sessionId, memberId: socket.member.memberId, name: socket.member.name };
  }

  private broadcast(message: unknown): void {
    for (const socket of this.sockets) this.queue({ socket, kind: "message", data: wire(message) });
  }

  private transmit(socket: FakeSocket, message: unknown): void {
    this.queue({ socket, kind: "message", data: wire(message) });
  }

  private handle(socket: FakeSocket, action: string, data: Record<string, unknown>): void {
    if (!this.sockets.has(socket)) return;
    if (action === "join") {
      this.join(socket, data);
    } else if (action === "submit") {
      this.submit(socket, data);
    } else {
      this.broadcast({
        type: "presence",
        event: "update",
        ...this.identity(socket),
        cursor: data.cursor ?? null,
        nodeId: data.nodeId ?? null,
        editing: data.editing === true,
      });
    }
  }

  private join(socket: FakeSocket, data: Record<string, unknown>): void {
    const prefix = `resume:${socket.member.memberId}:`;
    if (typeof data.resume === "string" && data.resume.startsWith(prefix))
      socket.sessionId = data.resume.slice(prefix.length);
    const base = {
      type: "sync",
      revision: this.revision,
      enabled: this.enabled,
      you: this.identity(socket),
      canEdit: socket.member.canEdit !== false,
      resume: FakeRoom.resumeToken(socket.member.memberId, socket.sessionId),
    };
    const last = data.lastSeq;
    const missed = this.log.filter((op) => typeof last === "number" && op.seq > last);
    const covered = typeof last === "number" && last <= this.revision && missed.length === this.revision - last;
    this.transmit(
      socket,
      covered ? { ...base, mode: "ops", ops: missed } : { ...base, mode: "snapshot", document: this.document },
    );
    if (socket.announced) return;
    socket.announced = true;
    this.broadcast({
      type: "presence",
      event: "join",
      ...this.identity(socket),
      cursor: null,
      nodeId: null,
      editing: false,
    });
  }

  private dedupeKey(socket: FakeSocket, clientOpId: string): string {
    return `${socket.member.memberId}:${socket.sessionId}:${clientOpId}`;
  }

  /** The server's answer to a submit that is not applied, or null to apply the operation. */
  private answer(socket: FakeSocket, clientOpId: string, raw: unknown): object | null {
    const rejected = (code: string, message: string) => ({ type: "rejected", clientOpId, code, message });
    if (socket.member.canEdit === false)
      return rejected("FORBIDDEN", "Your role in this workspace does not allow editing");
    if (!this.enabled) return rejected("COLLABORATION_OFF", "Live collaboration is turned off for this diagram");
    const existing = this.seen.get(this.dedupeKey(socket, clientOpId));
    if (existing !== undefined) return { type: "ack", clientOpId, seq: existing };
    const problem = decodeOperation(raw) ? this.refuse(raw) : "This change is not a valid operation";
    return problem === null ? null : rejected("INVALID", problem);
  }

  private submit(socket: FakeSocket, data: Record<string, unknown>): void {
    const clientOpId = String(data.clientOpId);
    this.submitted.push(data.op);
    const answer = this.answer(socket, clientOpId, data.op);
    const op = decodeOperation(data.op);
    if (answer !== null || !op) {
      this.transmit(socket, answer);
      return;
    }
    const key = this.dedupeKey(socket, clientOpId);
    this.state = applyOperation(this.state, op).state;
    this.revision += 1;
    this.seen.set(key, this.revision);
    const message = {
      type: "op",
      seq: this.revision,
      sessionId: socket.sessionId,
      clientOpId,
      memberId: socket.member.memberId,
      op: data.op,
    } as unknown as OpMessage;
    this.log.push(message);
    this.broadcast(message);
  }
}
