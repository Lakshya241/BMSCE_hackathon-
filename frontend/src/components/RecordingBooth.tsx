"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clapperboard, Trash2, ShieldCheck, ShieldAlert, Radio, Fingerprint, RefreshCw, Link2, Link2Off, Home, ShieldBan, Globe } from "lucide-react";
import { useDashboard } from "./DashboardProvider";
import { Btn, StatusDot, timeAgo } from "./ui";
import type { AreaMode } from "@/lib/types";

const MODE_META: Record<AreaMode, { icon: typeof Home; label: string; cls: string }> = {
  family: { icon: Home, label: "FAMILY", cls: "bg-lime-50 text-lime-700 border-lime-200" },
  restricted: { icon: ShieldBan, label: "RESTRICTED", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  public: { icon: Globe, label: "PUBLIC", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
};

/**
 * Recording Booth — the visible side of the 10-second rolling store.
 * Three area modes (family / restricted / public), live over WebSocket, each
 * capture hash-chained (digest = SHA256(prevDigest + image)) so any video edit
 * breaks the chain and is flagged by the built-in verifier.
 */
export function RecordingBooth() {
  const { state, api, connected } = useDashboard();
  const captures = state.captures ?? [];
  const stats = state.captureStats;
  const [selected, setSelected] = useState<string | null>(null);
  const [chain, setChain] = useState<{ intact: boolean; checked: number; brokenAt: string | null; reason: string | null } | null>(null);

  const verifyChain = () =>
    fetch("/backend/api/captures/verify")
      .then((r) => r.json())
      .then(setChain)
      .catch(() => setChain(null));
  useEffect(() => { verifyChain(); }, [captures.length]);

  const sel = captures.find((c) => c.id === selected) ?? captures[0] ?? null;

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="card p-5 flex flex-wrap items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-slate-950 grid place-items-center">
          <Clapperboard size={18} className="text-cyan-300" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h2 className="font-extrabold text-slate-900">Recording Booth — 10s rolling store</h2>
          <p className="text-xs text-slate-500">
            A frame is hashed + stored every 10 seconds <span className="font-semibold text-rose-600">only while a non-family person is present</span>. Family-only frames are suppressed by the privacy gate.
          </p>
        </div>
        <div className={`chip border text-[11px] font-bold ${connected ? "bg-lime-50 text-lime-700 border-lime-200" : "bg-rose-50 text-rose-600 border-rose-200"}`}>
          <Radio size={11} className="mr-1" /> {connected ? "LIVE" : "polling"}
        </div>
        <div className="flex gap-4 text-center">
          <div>
            <div className="text-xl font-extrabold mono text-slate-900">{stats?.total ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">heartbeats</div>
          </div>
          <div>
            <div className="text-xl font-extrabold mono text-lime-600">{stats?.kept ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">stored</div>
          </div>
          <div>
            <div className="text-xl font-extrabold mono text-amber-500">{stats?.skippedPrivate ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">suppressed</div>
          </div>
          <div>
            <div className={`text-xl font-extrabold mono ${(stats?.intrusions ?? 0) > 0 ? "text-rose-600" : "text-slate-300"}`}>{stats?.intrusions ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">intrusions</div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Btn variant="ghost" onClick={() => api.clearCaptures()}><RefreshCw size={13} /> Clear all</Btn>
          <Btn variant={chain && !chain.intact ? "danger" : "ghost"} onClick={verifyChain}>
            {chain && !chain.intact ? <Link2Off size={13} /> : <Link2 size={13} />}
            {chain ? (chain.intact ? `chain OK (${chain.checked})` : "CHAIN BROKEN") : "verify chain"}
          </Btn>
        </div>
      </div>

      {chain && !chain.intact && (
        <div className="card p-4 border-2 border-rose-400 bg-rose-50 text-sm text-rose-800 font-semibold">
          🚨 TAMPER DETECTED: hash chain broken at <span className="mono">{chain.brokenAt}</span> — {chain.reason}
        </div>
      )}

      {/* filmstrip + viewer */}
      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        {/* filmstrip */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs uppercase tracking-[0.18em] text-slate-400 font-bold">Captures ({captures.length})</h3>
            <StatusDot status={captures.length ? "online" : "offline"} />
          </div>
          <div className="space-y-2 max-h-[480px] overflow-auto pr-1">
            <AnimatePresence initial={false}>
              {captures.length === 0 && (
                <p className="text-xs text-slate-400 p-2">
                  No captures yet. Start the feed in the <a href="/dashboard/lab" className="text-cyan-700 font-bold underline">Detection Lab</a> — with a stranger in frame, a capture lands every 10s.
                </p>
              )}
              {captures.map((c) => (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 14 }}
                  onClick={() => setSelected(c.id)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-2 text-left transition-all ${sel?.id === c.id ? "border-cyan-500 bg-cyan-50" : "border-slate-200 hover:border-cyan-300"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.image} alt={c.id} className="h-12 w-20 rounded-lg object-cover border border-slate-200" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                      {(() => {
                        const meta = MODE_META[(c.mode ?? "family") as AreaMode] ?? MODE_META.family;
                        return <span className={`chip text-[8px] border ${meta.cls}`}><meta.icon size={8} className="mr-0.5" />{meta.label}</span>;
                      })()}
                      {c.intrusion && <span className="chip bg-rose-600 text-white border border-rose-600 text-[8px] font-bold">INTRUSION</span>}
                      {c.faces.length === 0 ? (
                        <ShieldCheck size={12} className="text-slate-400" />
                      ) : c.strangers > 0 ? (
                        <ShieldAlert size={12} className="text-rose-600" />
                      ) : (
                        <ShieldCheck size={12} className="text-lime-600" />
                      )}
                      {c.motion && <span className="chip bg-amber-50 text-amber-700 border border-amber-200 text-[9px]">motion</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 mono">{timeAgo(c.at)} · {c.cameraId}</div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); api.deleteCapture(c.id); }}
                    onKeyDown={(e) => e.key === "Enter" && api.deleteCapture(c.id)}
                    className="text-slate-300 hover:text-rose-600 p-1"
                  >
                    <Trash2 size={14} />
                  </span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* viewer */}
        <div className="card p-5">
          {sel ? (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden border-2 border-slate-800 bg-slate-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sel.image} alt={`capture ${sel.id}`} className="w-full object-cover" style={{ imageRendering: "pixelated" }} />
                {/* face boxes */}
                {sel.faces.map((f, i) => (
                  <div key={i} className="absolute border-2 pointer-events-none"
                    style={{
                      left: `${f.box.x * 100}%`, top: `${f.box.y * 100}%`, width: `${f.box.w * 100}%`, height: `${f.box.h * 100}%`,
                      borderColor: f.family ? "#65a30d" : "#e11d48",
                    }}>
                    <span className="absolute -top-5 left-0 text-[10px] font-bold px-1.5 py-0.5 rounded text-white mono"
                      style={{ background: f.family ? "#65a30d" : "#e11d48" }}>
                      {f.family ? `${f.match?.name ?? "FAMILY"}` : "STRANGER"}
                    </span>
                  </div>
                ))}
                <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
                  <span className="chip bg-slate-950/80 text-rose-300 text-[10px] mono">● {sel.cameraId}</span>
                  {(() => {
                    const meta = MODE_META[(sel.mode ?? "family") as AreaMode] ?? MODE_META.family;
                    return <span className={`chip text-[9px] border ${meta.cls}`}><meta.icon size={9} className="mr-1" />{meta.label}{sel.intrusion ? " · INTRUSION" : ""}</span>;
                  })()}
                </div>
                <div className="absolute bottom-2 right-2 chip bg-slate-950/80 text-cyan-300 text-[10px] mono">{new Date(sel.at).toLocaleTimeString()}</div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-slate-950 p-3 mono text-[10px] text-cyan-300 break-all">
                  <span className="text-slate-500">sha256 chain digest</span><br />{sel.digest}
                  {sel.prevDigest && <><br /><span className="text-slate-600">← prev: {sel.prevDigest.slice(0, 24)}…</span></>}
                </div>
                <div className="space-y-1.5 text-slate-600">
                  <div className="flex justify-between"><span className="text-slate-400">Capture ID</span><span className="mono">{sel.id}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Policy</span><span className="text-right">{sel.storedReason}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Intrusion</span><span className={sel.intrusion ? "text-rose-600 font-bold" : "text-lime-700"}>{sel.intrusion ? "YES — alarm raised" : "no"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Persons / motion</span><span className="mono">{sel.persons} / {sel.motion ? "yes" : "no"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Faces</span>
                    <span className="flex gap-1">
                      {sel.faces.length === 0 && <span className="text-slate-400">none</span>}
                      {sel.faces.map((f, i) => (
                        <span key={i} className={`chip text-[9px] border ${f.family ? "bg-lime-50 text-lime-700 border-lime-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                          <Fingerprint size={9} className="mr-0.5" />{f.family ? f.match?.name ?? "family" : "stranger"}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-slate-400">Size</span><span className="mono">{(sel.sizeBytes / 1024).toFixed(1)} KB</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 grid place-items-center text-slate-300 text-sm">
              <div className="text-center">
                <Clapperboard size={30} className="mx-auto mb-2 opacity-50" />
                Waiting for the first capture… start the Detection Lab feed.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
