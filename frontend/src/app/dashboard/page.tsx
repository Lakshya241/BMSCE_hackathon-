"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";
import { motion } from "framer-motion";
import { ShieldCheck, Play, FlaskConical, ChevronRight, Radio, Skull, Keyboard } from "lucide-react";
import { useDashboard } from "@/components/DashboardProvider";
import { Btn, SevBadge, StatTile, StatusDot, ModeBadge, timeAgo } from "@/components/ui";
import { RedTeamMode } from "@/components/RedTeamMode";
import { CommandPalette } from "@/components/CommandPalette";
import { CountUp } from "@/components/fx";

const STEP_LABELS = ["Simulate Incident", "Simulate Evidence Tampering", "Simulate Camera Attack"];

export default function Overview() {
  const { state, api, events, connected } = useDashboard();
  const [demoStep, setDemoStep] = useState(0);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoResult, setDemoResult] = useState<string | null>(null);
  const { analytics, stats, incidents, cameras, alerts, blockchain, verifications } = state;

  const runDemo = async () => {
    if (demoBusy) return;
    setDemoBusy(true);
    setDemoResult(null);
    try {
      const r = (await api.demoStep(demoStep)) as Record<string, unknown>;
      if (demoStep === 0) {
        const inc = r.incident as { id: string; evidenceHash?: string; blockchainTx?: string };
        setDemoResult(`${inc.id} verified 3/3 → SHA-256 ${inc.evidenceHash?.slice(0, 12)}… → MST tx ${inc.blockchainTx?.slice(0, 14)}… [SIMULATED / DEMO]`);
      } else if (demoStep === 1) {
        const t = r as { originalHash: string; currentHash: string };
        setDemoResult(`TAMPERING DETECTED · original ${t.originalHash.slice(0, 12)}… ≠ current ${t.currentHash.slice(0, 12)}… → INVALID`);
      } else {
        setDemoResult(`Camera ${(r.camera as string) ?? ""} attacked — feed obstructed, mesh failover engaged`);
      }
      setDemoStep((s) => (s + 1) % 3);
    } catch (e) {
      setDemoResult(String(e));
    } finally {
      setDemoBusy(false);
    }
  };

  const lastVerification = verifications[0];

  return (
    <div className="space-y-5">
      <CommandPalette />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Security Overview</h1>
          <p className="text-sm text-slate-500">Live via WebSocket — every change streams from the backend instantly.</p>
        </div>
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${blockchain?.mode === "live" ? "border-lime-300 bg-lime-50 text-lime-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
          <ShieldCheck size={14} />
          {blockchain?.mode === "live" ? "LIVE MST anchoring" : "DEMO MODE — txs simulated & labeled"}
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatTile label="Cameras online" value={<><CountUp value={cameras.filter((c) => c.status === "online").length} />/{cameras.length}</>} />
        <StatTile label="Active incidents" value={<CountUp value={stats.activeIncidents} />} accent="#d97706" />
        <StatTile label="Verified evidence" value={<CountUp value={stats.verified} />} accent="#65a30d" />
        <StatTile label="Tamper events" value={<CountUp value={stats.tampered} />} accent="#e11d48" />
        <StatTile label="MST transactions" value={`${stats.confirmedTx}/${stats.totalTx}`} sub="confirmed / total" accent="#4f46e5" />
        <StatTile label="Verification rate" value={`${analytics?.verificationRate ?? 0}%`} accent="#0d9488" />
      </div>

      {/* demo theater */}
      <div className="card p-5 border-2 border-cyan-200 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-32 w-32 bg-cyan-100 rounded-full blur-2xl" />
        <div className="flex items-center gap-2 mb-1 relative">
          <div className="h-8 w-8 rounded-lg bg-cyan-600 grid place-items-center"><FlaskConical size={15} className="text-white" /></div>
          <h2 className="font-extrabold text-slate-900">Demo Theater — the 3-step proof</h2>
          <div className="ml-auto flex items-center gap-2">
            <span className="chip bg-slate-100 text-slate-500 border border-slate-200"><Keyboard size={11} /> ⌘K</span>
            <RedTeamMode />
          </div>
        </div>
        <p className="text-xs text-slate-600 mb-4 relative">
          1 · Incident → 3 agents vote live → SHA-256 → MST anchor &nbsp;·&nbsp; 2 · Tamper evidence → chain rejects it &nbsp;·&nbsp; 3 · Attack a camera → mesh fails over.
        </p>
        <div className="flex flex-wrap items-center gap-3 relative">
          <Btn onClick={runDemo} disabled={demoBusy}>
            <Play size={14} /> {demoBusy ? "Running…" : STEP_LABELS[demoStep]}
          </Btn>
          <div className="flex gap-1.5">
            {["INCIDENT", "TAMPER", "CAMERA"].map((s, i) => (
              <span key={s} className={`chip border ${i === demoStep ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-400 border-slate-200"}`}>{s}</span>
            ))}
          </div>
          {demoBusy && <span className="text-xs text-cyan-700 font-bold mono pulse-dot">evidence → SHA-256 → MST anchor → agent votes…</span>}
        </div>
        {demoResult && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-xl border-2 border-lime-300 bg-lime-50 px-4 py-2.5 text-sm font-semibold text-lime-800 relative">
            {demoResult}
          </motion.div>
        )}
      </div>

      {/* charts */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500 mb-4">Incidents · last 7 days</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={analytics?.daily ?? []}>
              <defs>
                <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0891b2" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#0891b2" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gHigh" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e11d48" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#e11d48" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
              <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
              <Area type="monotone" dataKey="incidents" stroke="#0891b2" fill="url(#gInc)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="high" stroke="#e11d48" fill="url(#gHigh)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500 mb-4">Risk distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={analytics?.riskDistribution ?? []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {(analytics?.riskDistribution ?? []).map((_, i) => (
                  <Cell key={i} fill={["#22d3ee", "#f59e0b", "#f97316", "#e11d48"][i % 4]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* bottom row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* alerts */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500">Live alerts</h3>
            <button onClick={() => api.ackAll()} className="text-[11px] text-cyan-700 font-bold hover:underline">ack all</button>
          </div>
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {alerts.length === 0 && <p className="text-xs text-slate-400">No alerts.</p>}
            {alerts.slice(0, 12).map((a) => (
              <div key={a.id} className={`rounded-xl border p-3 text-xs ${a.acknowledged ? "border-slate-100 opacity-50" : a.severity === "critical" ? "border-rose-300 bg-rose-50" : "border-slate-200"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <SevBadge severity={a.severity} />
                  <span className="font-bold text-slate-800 flex-1 truncate">{a.title}</span>
                  {!a.acknowledged && (
                    <button onClick={() => api.ackAlert(a.id)} className="text-cyan-700 font-bold hover:underline">ack</button>
                  )}
                </div>
                <p className="text-slate-600 leading-relaxed">{a.message}</p>
                <span className="text-slate-400 text-[10px]">{timeAgo(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* latest incident */}
        <div className="card p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500 mb-3">Latest incident</h3>
          {incidents[0] ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <SevBadge severity={incidents[0].severity} />
                <span className="font-bold text-slate-900">{incidents[0].title}</span>
              </div>
              <div className="text-xs text-slate-600 space-y-1.5 mono">
                <div className="flex justify-between"><span className="text-slate-400">ID</span><span>{incidents[0].id}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Camera</span><span>{incidents[0].cameraId}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Risk</span><span className="text-amber-600 font-bold">{incidents[0].riskScore}/100</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="capitalize inline-flex items-center gap-1.5"><StatusDot status={incidents[0].verificationStatus} /> {incidents[0].verificationStatus}</span></div>
              </div>
              {incidents[0].evidenceHash && (
                <div className="rounded-xl bg-slate-950 p-2.5 mono text-[10px] text-cyan-300 break-all">sha256: {incidents[0].evidenceHash}</div>
              )}
              {incidents[0].blockchainTx && (
                <div className="rounded-xl bg-slate-950 p-2.5 mono text-[10px] text-indigo-300 break-all flex items-center justify-between gap-2">
                  <span className="break-all">mst tx: {incidents[0].blockchainTx}</span>
                </div>
              )}
              {incidents[0].txMode && <ModeBadge mode={incidents[0].txMode} />}
              <Link href="/dashboard/incidents" className="text-xs text-cyan-700 font-bold hover:underline inline-flex items-center gap-1">
                open incident log <ChevronRight size={12} />
              </Link>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No incidents yet — run the demo or use the Detection Lab.</p>
          )}
        </div>

        {/* live event feed */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Radio size={13} className={`text-cyan-600 ${connected ? "glow-pulse" : ""}`} />
            <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500">Live backend events</h3>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-auto">
            {events.length === 0 && <p className="text-xs text-slate-400">Waiting for events…</p>}
            {events.slice(0, 16).map((e, i) => (
              <motion.div key={e.timestamp + String(i)} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-2 text-[11px]">
                <span className="mono text-slate-400 shrink-0">{new Date(e.timestamp).toLocaleTimeString()}</span>
                <span className={`shrink-0 mt-1 h-1.5 w-1.5 rounded-full ${e.level === "critical" ? "bg-rose-500" : e.level === "high" ? "bg-orange-400" : e.level === "medium" ? "bg-amber-400" : "bg-cyan-500"}`} />
                <span className={e.level === "critical" ? "text-rose-600 font-semibold" : "text-slate-700"}>{e.message}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* agent consensus */}
      {lastVerification && (
        <div className="card p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500 mb-3">Agent consensus · {lastVerification.incidentId}</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            {lastVerification.agents.map((a) => (
              <div key={a.name} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <StatusDot status={a.result === "confirmed" ? "confirmed" : a.result === "rejected" ? "rejected" : "pending"} />
                  <span className="font-bold text-sm text-slate-800">{a.name}</span>
                  <span className="ml-auto mono text-xs text-slate-500">{(a.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-lime-500" style={{ width: `${a.confidence * 100}%` }} />
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{a.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
