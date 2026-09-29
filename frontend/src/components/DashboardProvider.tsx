"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, useLive } from "@/lib/api";
import type { Camera, Incident, Settings, Snapshot, Capture, FamilyMember } from "@/lib/types";

interface Ctx {
  state: Snapshot;
  events: ReturnType<typeof useLive>["events"];
  connected: boolean;
  refresh: () => void;
  api: {
    createIncident: (payload: Record<string, unknown>) => Promise<Incident>;
    demoStep: (step: number) => Promise<unknown>;
    tamperEvidence: (incidentId: string, method?: string) => Promise<{ originalHash: string; currentHash: string }>;
    reverify: (incidentId: string) => Promise<boolean>;
    patchIncident: (id: string, patch: Partial<Incident>) => Promise<void>;
    patchCamera: (id: string, patch: Partial<Camera>) => Promise<void>;
    addCamera: (payload: { name: string; location: string }) => Promise<void>;
    removeCamera: (id: string) => Promise<void>;
    ackAlert: (id: string) => Promise<void>;
    ackAll: () => Promise<void>;
    patchSettings: (patch: Partial<Settings>) => Promise<void>;
    nodeFailover: (id: string) => Promise<void>;
    nodeReactivate: (id: string) => Promise<void>;
    addFamilyMember: (payload: Record<string, unknown>) => Promise<FamilyMember>;
    removeFamilyMember: (id: string) => Promise<void>;
    sendCapture: (payload: Record<string, unknown>) => Promise<{ stored: boolean; reason: string; capture?: Capture }>;
    deleteCapture: (id: string) => Promise<void>;
    clearCaptures: () => Promise<void>;
  };
  toast: (msg: string, sev?: "info" | "high" | "critical" | "success") => void;
}

const EMPTY: Snapshot = {
  cameras: [], incidents: [], alerts: [], evidence: [], transactions: [], nodes: [], verifications: [],
  activity: [], family: [], captures: [],
  captureStats: { total: 0, kept: 0, skippedPrivate: 0, intrusions: 0, lastAt: null },
  settings: {
    armed: true, demoMode: true, mstNetwork: "MST Testnet", motionSensitivity: 65, riskThreshold: 55,
    privacyMaskDefault: false, autoAnchor: true, quorumAgents: 3, updatedAt: "",
  },
  blockchain: {
    network: "connecting…", chainId: null, connected: false, mode: "demo", contractAddress: null,
    explorerUrl: null, walletAddress: null, latestBlock: null, message: "connecting to backend…",
  },
  analytics: { incidentsByType: [], riskDistribution: [], daily: [], verificationRate: 0, avgRisk: 0 },
  stats: { totalIncidents: 0, activeIncidents: 0, verified: 0, tampered: 0, totalTx: 0, confirmedTx: 0 },
  serverTime: "",
};

const Ctx = createContext<Ctx | null>(null);

export function useDashboard(): Ctx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const { snapshot, events, connected, refresh } = useLive();
  const [toasts, setToasts] = useState<{ id: number; msg: string; sev: string }[]>([]);
  const knownAlerts = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const pushToast = useCallback((msg: string, sev = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, sev }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    for (const a of snapshot.alerts ?? []) {
      if (!a.acknowledged && (a.severity === "critical" || a.severity === "high") && !knownAlerts.current.has(a.id)) {
        knownAlerts.current.add(a.id);
        if (!firstLoad.current) pushToast(`🚨 ${a.title}`, a.severity === "critical" ? "critical" : "high");
      }
    }
    firstLoad.current = false;
  }, [snapshot, pushToast]);

  const post = useCallback(
    (path: string, body: unknown) => api(path, { method: "POST", body: JSON.stringify(body) }),
    []
  );

  const doApi: Ctx["api"] = {
    createIncident: (payload) => post("/incidents", payload) as Promise<Incident>,
    demoStep: (step) => post("/demo", { step }),
    tamperEvidence: (incidentId, method) =>
      post("/evidence", { action: "tamper", incidentId, method }) as Promise<{ originalHash: string; currentHash: string }>,
    reverify: (incidentId) => post("/evidence", { action: "reverify", incidentId }).then((r) => (r as { intact: boolean }).intact),
    patchIncident: async (id, patch) => { await api("/incidents", { method: "PATCH", body: JSON.stringify({ id, ...patch }) }); refresh(); },
    patchCamera: async (id, patch) => { await api("/cameras", { method: "PATCH", body: JSON.stringify({ id, ...patch }) }); refresh(); },
    addCamera: async (payload) => { await post("/cameras", payload); refresh(); },
    removeCamera: async (id) => { await api(`/cameras/${id}`, { method: "DELETE" }); refresh(); },
    ackAlert: async (id) => { await api("/alerts", { method: "PATCH", body: JSON.stringify({ id }) }); refresh(); },
    ackAll: async () => { await api("/alerts", { method: "PATCH", body: JSON.stringify({ action: "ackAll" }) }); refresh(); },
    patchSettings: async (patch) => { await api("/settings", { method: "PATCH", body: JSON.stringify(patch) }); refresh(); },
    nodeFailover: async (id) => { await post("/nodes", { action: "failover", id }); refresh(); },
    nodeReactivate: async (id) => { await post("/nodes", { action: "reactivate", id }); refresh(); },
    addFamilyMember: (payload) => post("/family", payload) as Promise<FamilyMember>,
    removeFamilyMember: async (id) => { await api(`/family/${id}`, { method: "DELETE" }); refresh(); },
    sendCapture: (payload) => post("/captures", payload) as Promise<{ stored: boolean; reason: string; capture?: Capture }>,
    deleteCapture: async (id) => { await api(`/captures/${id}`, { method: "DELETE" }); refresh(); },
    clearCaptures: async () => { await post("/captures/clear", {}); refresh(); },
  };

  return (
    <Ctx.Provider value={{ state: snapshot ?? EMPTY, events, connected, refresh, api: doApi, toast: pushToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`card p-3.5 text-sm border ${
              t.sev === "critical" ? "border-rose-300 text-rose-700 glow-red"
              : t.sev === "high" ? "border-orange-300 text-orange-700"
              : t.sev === "success" ? "border-lime-300 text-lime-700 glow-green"
              : "border-cyan-300 text-cyan-700"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
