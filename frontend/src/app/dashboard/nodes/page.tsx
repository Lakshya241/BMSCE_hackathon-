"use client";

import { Server, Zap } from "lucide-react";
import { useDashboard } from "@/components/DashboardProvider";
import { Btn, StatusDot } from "@/components/ui";

export default function NodesPage() {
  const { state, api, toast } = useDashboard();
  const nodes = state.nodes;
  const totalStake = nodes.reduce((s, n) => s + n.stake, 0);
  const activeCount = nodes.filter((n) => n.status === "active").length;

  const failover = async (id: string, name: string) => {
    await api.nodeFailover(id);
    toast(`⚡ ${name} offline — duty reassigned to highest-stake node`, "high");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Node Mesh</h1>
        <p className="text-sm text-slate-500">DePIN-style verifier network — kill a node and watch consensus re-route.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <Tile label="Nodes active" value={`${activeCount}/${nodes.length}`} />
        <Tile label="Total stake" value={`${(totalStake / 1000).toFixed(1)}k MST`} />
        <Tile label="Regions" value={String(new Set(nodes.map((n) => n.region)).size)} />
        <Tile label="Consensus" value={activeCount >= 3 ? "HEALTHY" : "DEGRADED"} accent={activeCount >= 3 ? "#65a30d" : "#e11d48"} />
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-4">
        <div className="grid md:grid-cols-2 gap-3">
          {nodes.map((n) => (
            <div key={n.id} className={`card card-hover p-4 ${n.status === "offline" ? "border-rose-300" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <StatusDot status={n.status} />
                  <span className="font-bold text-sm text-slate-800">{n.name}</span>
                  <span className="chip bg-slate-100 text-slate-500 border border-slate-200">{n.role}</span>
                </div>
                <span className="mono text-[10px] text-slate-400">{n.id}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-[11px] mb-3">
                <div><div className="text-slate-400 text-[9px] uppercase font-bold">Region</div><div className="text-slate-700 font-semibold">{n.region}</div></div>
                <div><div className="text-slate-400 text-[9px] uppercase font-bold">Stake</div><div className="text-cyan-700 mono font-bold">{(n.stake / 1000).toFixed(1)}k</div></div>
                <div><div className="text-slate-400 text-[9px] uppercase font-bold">Uptime</div><div className="text-slate-700 mono">{n.uptime}%</div></div>
                <div><div className="text-slate-400 text-[9px] uppercase font-bold">Ping</div><div className="text-slate-700 mono">{n.latencyMs}ms</div></div>
              </div>
              <div className="flex gap-2">
                {n.status === "offline" ? (
                  <Btn variant="success" onClick={() => api.nodeReactivate(n.id)}>Reactivate</Btn>
                ) : (
                  <Btn variant="danger" onClick={() => failover(n.id, n.name)}><Zap size={12} /> Kill node (failover)</Btn>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Server size={15} className="text-cyan-700" />
            <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500">Mesh topology</h3>
          </div>
          <svg viewBox="0 0 320 320" className="w-full">
            <circle cx="160" cy="160" r="105" fill="none" stroke="#e2e8f0" strokeDasharray="4 4" />
            <circle cx="160" cy="160" r="60" fill="none" stroke="#e2e8f0" strokeDasharray="4 4" />
            {nodes.map((n, i) => {
              const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
              const r = n.role === "validator" ? 105 : 60;
              const x = 160 + Math.cos(a) * r;
              const y = 160 + Math.sin(a) * r;
              const color = n.status === "active" ? "#0891b2" : n.status === "syncing" ? "#d97706" : "#e11d48";
              return (
                <g key={n.id}>
                  <line x1="160" y1="160" x2={x} y2={y} stroke={color} strokeOpacity="0.3" />
                  <circle cx={x} cy={y} r="10" fill="#fff" stroke={color} strokeWidth="2.5" />
                  <circle cx={x} cy={y} r="4" fill={color} className="pulse-dot" />
                  <text x={x} y={y - 16} textAnchor="middle" fontSize="8" fill="#64748b" fontWeight="700">{n.region}</text>
                </g>
              );
            })}
            <circle cx="160" cy="160" r="18" fill="#fff" stroke="#65a30d" strokeWidth="2.5" />
            <text x="160" y="164" textAnchor="middle" fontSize="8" fill="#65a30d" fontWeight="800">MST</text>
          </svg>
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
            Validators (outer ring) finalize blocks; verifiers (inner ring) re-examine evidence packets.
            Killing a node triggers highest-stake failover — no single point of trust.
          </p>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, accent = "#0891b2" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card py-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">{label}</div>
      <div className="text-xl font-black mono mt-1" style={{ color: accent }}>{value}</div>
    </div>
  );
}
