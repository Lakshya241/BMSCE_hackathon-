import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { onEvent } from "../lib/bus";
import { buildSnapshot } from "../lib/snapshot";

/** WebSocket hub — the live-data artery between backend and frontend. */

let wss: WebSocketServer | null = null;

export function initHub(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket: WebSocket) => {
    socket.send(JSON.stringify(buildSnapshot()));
    socket.on("message", (raw) => {
      // client ping / subscribe messages — respond with fresh snapshot
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === "refresh") socket.send(JSON.stringify(buildSnapshot()));
      } catch {
        /* ignore */
      }
    });
  });

  // After every event: push the event itself (fast), then a full snapshot (source of truth)
  onEvent((e) => {
    broadcast(e);
    setTimeout(() => broadcast(buildSnapshot()), 120);
  });
}

export function broadcast(payload: unknown): void {
  if (!wss) return;
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch {
        /* ignore */
      }
    }
  }
}

export function clientCount(): number {
  return wss ? wss.clients.size : 0;
}
