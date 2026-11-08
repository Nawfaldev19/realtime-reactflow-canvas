import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransportHandlers } from "./client";

const consumer = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  subscriptions: { create: vi.fn() },
};
const subscription = { perform: vi.fn(() => true), unsubscribe: vi.fn() };
const createConsumer = vi.fn<(url: () => string) => typeof consumer>(() => consumer);

vi.mock("@rails/actioncable", () => ({ createConsumer: (url: () => string) => createConsumer(url) }));

const { cableTransport, CABLE_URL } = await import("./cable");

function handlers() {
  const spies = { connected: vi.fn(), disconnected: vi.fn(), rejected: vi.fn(), received: vi.fn() };
  const events: TransportHandlers = {
    connected: () => {
      spies.connected();
    },
    disconnected: () => {
      spies.disconnected();
    },
    rejected: () => {
      spies.rejected();
    },
    received: (data) => {
      spies.received(data);
    },
  };
  return { spies, events };
}

describe("cableTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumer.subscriptions.create.mockReturnValue(subscription);
  });

  it("puts the socket next to the GraphQL endpoint", () => {
    expect(CABLE_URL).toBe("ws://localhost:3000/cable");
  });

  it("opens one consumer with the session token and subscribes to the diagram's room, without a session id", () => {
    const { events } = handlers();
    let token = "first token";
    const transport = cableTransport(() => token)({ diagramId: "9" }, events);
    transport.open();

    const url = createConsumer.mock.calls[0]?.[0];
    token = "renewed";
    expect(url?.()).toBe("ws://localhost:3000/cable?token=renewed");
    expect(consumer.subscriptions.create).toHaveBeenCalledWith(
      { channel: "DiagramChannel", diagram_id: "9" },
      expect.any(Object),
    );

    transport.close();
    transport.open();
    expect(createConsumer).toHaveBeenCalledTimes(1);
    expect(consumer.disconnect).toHaveBeenCalledTimes(1);
    expect(consumer.connect).toHaveBeenCalledTimes(1);
  });

  it("passes the subscription's callbacks on", () => {
    const { events, spies } = handlers();
    cableTransport(() => null)({ diagramId: "9" }, events).open();
    const mixin = consumer.subscriptions.create.mock.calls[0]?.[1] as Required<
      Record<"connected" | "disconnected" | "rejected" | "received", (data?: unknown) => void>
    >;

    mixin.connected();
    mixin.disconnected();
    mixin.rejected();
    mixin.received({ type: "op" });

    expect(spies.connected).toHaveBeenCalled();
    expect(spies.disconnected).toHaveBeenCalled();
    expect(spies.rejected).toHaveBeenCalled();
    expect(spies.received).toHaveBeenCalledWith({ type: "op" });
    expect((createConsumer.mock.calls[0]?.[0] as () => string)()).toBe("ws://localhost:3000/cable?token=");
  });

  it("performs actions once open, and reports when it cannot", () => {
    const transport = cableTransport(() => "t")({ diagramId: "9" }, handlers().events);
    expect(transport.perform("join", { lastSeq: 0 })).toBe(false);
    transport.close();

    transport.open();
    expect(transport.perform("join", { lastSeq: 0 })).toBe(true);
    expect(subscription.perform).toHaveBeenCalledWith("join", { lastSeq: 0 });

    transport.dispose();
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(consumer.disconnect).toHaveBeenCalled();
    expect(transport.perform("presence", {})).toBe(false);
  });
});
