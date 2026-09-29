"use client";

import { useDashboard } from "@/components/DashboardProvider";

const KIND_COLOR: Record<string, string> = {
  incident_created: "text-rose-600",
  anchored: "text-indigo-600",
  tamper_detected: "text-rose-700 font-bold",
  reverify: "text-cyan-700",
  node_failover: "text-amber-600",
  camera_tamper: "text-rose-600",
  verifier_registered: "text-lime-700",
  note: "text-slate-500",
};

export default function ActivityPage() {
  const { state } = useDashboard();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Chain-of-Custody Ledger</h1>
        <p className="text-sm text-slate-500">Append-only audit trail — every pipeline step is persisted in the backend JSON store.</p>
      </div>
      <div className="card p-5">
        <div className="space-y-0">
          {state.activity.map((e, idx) => (
            <div key={e.id} className="flex gap-4 relative pb-5">
              {idx < state.activity.length - 1 && <div className="absolute left-[7px] top-4 bottom-0 w-px bg-slate-200" />}
              <div className={`mt-1 h-3.5 w-3.5 rounded-full border-2 shrink-0 ${
                e.level === "critical" ? "border-rose-500 bg-rose-100" : e.level === "high" ? "border-orange-400 bg-orange-100" : e.level === "medium" ? "border-amber-400 bg-amber-100" : "border-cyan-500 bg-cyan-100"
              }`} />
              <div className="min-w-0">
                <div className="text-sm">
                  <span className={`font-bold ${KIND_COLOR[e.kind] ?? "text-slate-700"}`}>{e.kind.replace(/_/g, " ")}</span>
                  <span className="text-slate-700"> — {e.message}</span>
                </div>
                <div className="text-[11px] text-slate-400 mono">{new Date(e.timestamp).toLocaleString()}</div>
              </div>
            </div>
          ))}
          {state.activity.length === 0 && <p className="text-sm text-slate-400">Ledger empty.</p>}
        </div>
      </div>
    </div>
  );
}
