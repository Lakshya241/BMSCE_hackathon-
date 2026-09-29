import type { Severity, TxMode, TxType, WsEvent } from "./types";

/** Event bus: broadcasts live events to all WebSocket clients. */

type Listener = (e: WsEvent) => void;
const listeners = new Set<Listener>();

export function onEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface BusEvent {
  kind:
    | "incident_created"
    | "agent_vote"
    | "verification_complete"
    | "tx_submitted"
    | "tx_confirmed"
    | "tamper_detected"
    | "camera_tamper"
    | "node_failover"
    | "camera_update"
    | "settings_update"
    | "alert"
    | "activity"
    | "family_update"
    | "capture_stored"
    | "capture_skipped"
    | "capture_deleted";
  level: Severity | "info";
  message: string;
  data?: Record<string, unknown>;
}

export function emitEvent(ev: BusEvent): void {
  const payload: WsEvent = {
    type: "event",
    event: { kind: ev.kind, level: ev.level, message: ev.message, timestamp: new Date().toISOString(), data: ev.data },
  };
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch {
      /* client gone */
    }
  }
}

export function modeLabel(mode: TxMode): string {
  return mode === "live" ? "LIVE ON-CHAIN" : "SIMULATED / DEMO";
}

export function txKindFor(type: TxType): BusEvent["kind"] {
  return type === "TAMPER_REPORT" ? "tamper_detected" : "tx_submitted";
}
