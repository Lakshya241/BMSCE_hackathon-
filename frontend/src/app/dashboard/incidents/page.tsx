"use client";

import { useMemo, useState } from "react";
import { Search, Filter } from "lucide-react";
import { useDashboard } from "@/components/DashboardProvider";
import { Btn, ModeBadge, SevBadge, StatusDot, timeAgo, shortHash } from "@/components/ui";

export default function IncidentsPage() {
  const { state, api } = useDashboard();
  const [query, setQuery] = useState("");
  const [sev, setSev] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      state.incidents.filter(
        (i) =>
          (sev === "all" || i.severity === sev) &&
          (query === "" ||
            i.title.toLowerCase().includes(query.toLowerCase()) ||
            i.id.toLowerCase().includes(query.toLowerCase()) ||
            i.cameraId.toLowerCase().includes(query.toLowerCase()))
      ),
    [state.incidents, query, sev]
  );
  const incident = state.incidents.find((i) => i.id === selected);
  const evidence = state.evidence.find((e) => e.incidentId === selected);
  const verification = state.verifications.find((v) => v.incidentId === selected);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Incident Log</h1>
        <p className="text-sm text-slate-500">Every detection that crossed the risk threshold, with its evidence and chain record.</p>
      </div>

      <div className="card p-3 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-52">
          <Search size={14} className="text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search id, title, camera…"
            className="bg-transparent flex-1 text-sm outline-none placeholder:text-slate-400 text-slate-900" />
        </div>
        <Filter size={14} className="text-slate-400" />
        {["all", "critical", "high", "medium", "low"].map((s) => (
          <button key={s} onClick={() => setSev(s)}
            className={`chip border ${sev === s ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-500 border-slate-200 hover:border-cyan-400"}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Incident</th>
                  <th className="px-4 py-3">Camera</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Chain</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} onClick={() => setSelected(i.id)}
                    className={`cursor-pointer border-b border-slate-100 hover:bg-cyan-50/60 ${selected === i.id ? "bg-cyan-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{i.title}</div>
                      <div className="text-[11px] text-slate-400 mono">{i.id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs mono">{i.cameraId}</td>
                    <td className="px-4 py-3"><SevBadge severity={i.severity} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full ${i.riskScore >= 80 ? "bg-rose-500" : i.riskScore >= 60 ? "bg-orange-400" : i.riskScore >= 38 ? "bg-amber-400" : "bg-cyan-500"}`} style={{ width: `${i.riskScore}%` }} />
                        </div>
                        <span className="mono text-xs text-slate-600">{i.riskScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {i.blockchainTx ? <span className="mono text-[11px] text-indigo-600">{shortHash(i.blockchainTx, 8)}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        <StatusDot status={i.verificationStatus} />
                        <span className="text-slate-600 capitalize">{i.verificationStatus}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(i.timestamp)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">No incidents match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-5 h-fit sticky top-20">
          {incident ? (
            <div className="space-y-4 text-sm">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <SevBadge severity={incident.severity} />
                  <span className="mono text-xs text-slate-400">{incident.id}</span>
                </div>
                <h3 className="font-black text-lg text-slate-900">{incident.title}</h3>
                <p className="text-xs text-slate-500 mt-1">{incident.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs mono">
                <Field k="camera" v={incident.cameraId} />
                <Field k="type" v={incident.type} />
                <Field k="risk" v={`${incident.riskScore}/100`} />
                <Field k="source" v={incident.source ?? "simulated"} />
                <Field k="frames" v={String(incident.frames ?? "—")} />
                <Field k="zone" v={incident.zone ?? "—"} />
              </div>

              {evidence && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Evidence packet</div>
                  <div className="space-y-1 mono text-[10px] break-all">
                    <div className="text-slate-400">original: <span className="text-cyan-700">{evidence.originalHash}</span></div>
                    <div className="text-slate-400">current:&nbsp; <span className={evidence.tampered ? "text-rose-600 font-bold" : "text-cyan-700"}>{evidence.currentHash}</span></div>
                    <div className={evidence.tampered ? "text-rose-600 font-black" : "text-lime-700 font-black"}>
                      {evidence.tampered ? `TAMPERED (${evidence.tamperMethod})` : "AUTHENTIC"}
                    </div>
                  </div>
                </div>
              )}

              {verification && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Agent consensus · {verification.quorum}</div>
                  <div className="space-y-1.5">
                    {verification.agents.map((a) => (
                      <div key={a.name} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">{a.name}</span>
                        <span className={a.result === "confirmed" ? "text-lime-700 font-bold" : "text-amber-600"}>
                          {a.result} {(a.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {incident.blockchainTx && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold mb-1.5">MST anchor</div>
                  <div className="mono text-[10px] break-all text-indigo-700">{incident.blockchainTx}</div>
                  <div className="mt-2 flex items-center gap-2">
                    {incident.txMode && <ModeBadge mode={incident.txMode} />}
                    <a href="/dashboard/blockchain" className="text-[11px] text-cyan-700 font-bold hover:underline">view in explorer →</a>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Btn variant="ghost" onClick={() => api.patchIncident(incident.id, { status: "investigating" })}>Investigate</Btn>
                <Btn variant="success" onClick={() => api.patchIncident(incident.id, { status: "resolved" })}>Resolve</Btn>
                <Btn variant="ghost" onClick={() => api.patchIncident(incident.id, { status: "false_alarm" })}>False alarm</Btn>
                {evidence?.tampered && (
                  <Btn variant="primary" onClick={() => api.reverify(incident.id)}>Re-verify hash</Btn>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 py-10 text-center">Select an incident to inspect its full evidence chain.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{k}</div>
      <div className="text-slate-700">{v}</div>
    </div>
  );
}
