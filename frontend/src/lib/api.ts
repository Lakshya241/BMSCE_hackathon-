import { useEffect, useRef, useState } from "react";
import type { LiveEvent, Snapshot } from "./types";

/**
 * Backend connection layer.
 * REST : same-origin /backend/api/* (proxied by Next to the backend).
 * WS   : direct WebSocket to the backend for live data.
 */

export const BACKEND_HTTP = "/backend/api";
export const BACKEND_WS =
  (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000").replace(/^http/, "ws") + "/ws";

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_HTTP}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface LiveState {
  snapshot: Snapshot | null;
  events: LiveEvent[];
  connected: boolean;
  refresh: () => void;
}

/** Live data via WebSocket; falls back to REST polling if WS fails. */
export function useLive(): LiveState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pullSnapshot = () => {
    api<Snapshot>("/state")
      .then(setSnapshot)
      .catch(() => undefined);
  };

  useEffect(() => {
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(BACKEND_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
      ws.onmessage = (m) => {
        try {
          const msg = JSON.parse(m.data);
          if (msg.type === "snapshot") setSnapshot(msg as Snapshot);
          if (msg.type === "event") {
            setEvents((e) => [msg.event as LiveEvent, ...e].slice(0, 60));
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        // fallback to REST polling
        if (!pollRef.current) {
          pullSnapshot();
          pollRef.current = setInterval(pullSnapshot, 2500);
        }
        retryTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    pullSnapshot();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      if (pollRef.current) clearInterval(pollRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { snapshot, events, connected, refresh: pullSnapshot };
}
