"use client";

import { useState } from "react";
import { Fingerprint, ShieldCheck, ShieldX } from "lucide-react";
import { useDashboard } from "@/components/DashboardProvider";
import { Btn, StatusDot, timeAgo } from "@/components/ui";
import { HashSnowflake } from "@/components/fx";

export default function EvidencePage() {
  const { state } = useDashboard();
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<null | { found: boolean; intact?: boolean; tampered?: boolean; incidentId?: string; evidenceId?: string }>(null);
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    const h = hash.trim();
    if (h.length !== 64) {
      setResult({ found: false });
      return;
    }
    setChecking(true);
    try {
      const res = await fetch("/backend/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", hash: h }),
      });
      setResult(await res.json());
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Evidence Vault</h1>
        <p className="text-sm text-slate-500">Hash-chained evidence packets — original vs current digest.</p>
      </div>

      <div className="card p-5 border-2 border-cyan-200">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-8 w-8 rounded-lg bg-cyan-600 grid place-items-center"><Fingerprint size={15} className="text-white" /></div>
          <h2 className="font-extrabold text-slate-900">Independent Hash Verifier</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Paste any evidence hash — the backend checks it against anchored original and current digests.
        </p>
        <div className="flex gap-2">
          <input
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            placeholder="64-character SHA-256 hex digest…"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs mono focus:border-cyan-500 outline-none text-slate-900"
          />
          <Btn onClick={verify} disabled={checking}>{checking ? "Checking…" : "Verify"}</Btn>
        </div>
        {result && (
          <div className={`mt-3 rounded-xl border-2 px-4 py-3 text-sm ${result.found ? (result.intact ? "border-lime-300 bg-lime-50 text-lime-800" : "border-rose-300 bg-rose-50 text-rose-700") : "border-slate-200 text-slate-500"}`}>
            {result.found ? (
              <div className="flex items-center gap-2">
                {result.intact ? <ShieldCheck size={16} /> : <ShieldX size={16} />}
                <span className="font-black">{result.intact ? "AUTHENTIC" : "TAMPERED / INVALID"}</span>
                <span className="text-xs opacity-70">· {result.evidenceId} · incident {result.incidentId}</span>
              </div>
            ) : (
              "No evidence matches that hash. Ensure it is a full 64-char digest."
            )}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {state.evidence.map((e) => {
          const intact = e.currentHash === e.originalHash;
          return (
            <div key={e.id} className={`card card-hover p-4 ${e.tampered ? "border-rose-300" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="mono text-xs text-slate-600">{e.id}</span>
                <span className={`chip border ${intact ? "bg-lime-50 text-lime-700 border-lime-300" : "bg-rose-50 text-rose-600 border-rose-300"}`}>
                  {intact ? "AUTHENTIC" : "TAMPERED"}
                </span>
              </div>
              <div className="flex items-start gap-3 mb-2">
                <HashSnowflake hash={e.currentHash} size={44} corrupted={e.tampered} />
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500">
                    incident <span className="text-slate-700">{e.incidentId}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{e.frameCount ?? "?"} frames · {(e.sizeBytes / 1024).toFixed(1)}KB</div>
                  <div className={`text-[10px] font-bold ${e.tampered ? "text-rose-600" : "text-lime-700"}`}>
                    {e.tampered ? "fingerprint corrupted" : "fingerprint intact"}
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-slate-950 p-2 mono text-[9px] leading-relaxed break-all space-y-0.5">
                <div className="text-slate-400">orig <span className="text-cyan-300">{e.originalHash}</span></div>
                <div className="text-slate-400">cur&nbsp;&nbsp; <span className={intact ? "text-cyan-300" : "text-rose-400"}>{e.currentHash}</span></div>
              </div>
              <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><StatusDot status={e.chainStatus} /> chain: {e.chainStatus}</span>
                <span>{timeAgo(e.createdAt)}</span>
              </div>
            </div>
          );
        })}
        {state.evidence.length === 0 && (
          <div className="card p-10 text-center text-sm text-slate-400 md:col-span-2 xl:col-span-3">Vault is empty.</div>
        )}
      </div>
    </div>
  );
}
