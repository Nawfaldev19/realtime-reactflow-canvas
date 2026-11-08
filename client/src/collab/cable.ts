import { createConsumer, type Consumer, type Subscription } from "@rails/actioncable";
import { API_URL } from "../lib/apollo";
import { cableUrlFor } from "../security/headers";
import type { Transport, TransportFactory, TransportHandlers } from "./client";

// The ActionCable transport. The session token goes in the socket URL because
// browsers cannot set headers on a WebSocket handshake; the server refuses
// the handshake without a valid one. Reconnecting is left to our state
// machine (syncMachine.ts), so every close stops ActionCable's own monitor.

/** ws(s)://host/cable next to the GraphQL endpoint, unless VITE_CABLE_URL says otherwise. */
export const CABLE_URL: string = import.meta.env.VITE_CABLE_URL ?? cableUrlFor(API_URL);

export function cableTransport(getToken: () => string | null): TransportFactory {
  return ({ diagramId }, handlers: TransportHandlers): Transport => {
    let consumer: Consumer | null = null;
    let subscription: Subscription | null = null;
    const url = () => `${CABLE_URL}?token=${encodeURIComponent(getToken() ?? "")}`;
    return {
      open: () => {
        if (consumer) {
          consumer.connect();
          return;
        }
        consumer = createConsumer(url);
        subscription = consumer.subscriptions.create(
          { channel: "DiagramChannel", diagram_id: diagramId },
          {
            connected: () => {
              handlers.connected();
            },
            disconnected: () => {
              handlers.disconnected();
            },
            rejected: () => {
              handlers.rejected();
            },
            received: (data: unknown) => {
              handlers.received(data);
            },
          },
        );
      },
      close: () => consumer?.disconnect(),
      perform: (action, data) => subscription?.perform(action, data) ?? false,
      dispose: () => {
        subscription?.unsubscribe();
        consumer?.disconnect();
        subscription = null;
        consumer = null;
      },
    };
  };
}
