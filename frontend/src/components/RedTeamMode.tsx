"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Skull, X, Terminal, ShieldCheck } from "lucide-react";
import { useDashboard } from "./DashboardProvider";
import { Btn } from "./ui";

interface Step {
  label: string;
  run: () => Promise<void>;
}

/** RED TEAM MODE — a scripted attack run that fires the whole defense stack. */
export function RedTeamMode() {
  const { state, api, toast, refresh } = useDashboard();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState(-1); // -1 idle, 0..n running, n = done
  const [log, setLog] = useState<string[]>([]);

  const phases: Step[] = [
    {
      label: "PHASE 1 · Jam camera feed",
      run: async () => {
        const cam = state.cameras.find((c) => c.status === "online") ?? state.cameras[0];
        if (cam) await api.patchCamera(cam.id, { status: "compromised" });
        setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${cam?.id ?? "?"} signal jammed — blackout detected by integrity monitor`]);
      },
    },
    {
      label: "PHASE 2 · Splice evidence",
      run: async () => {
        const target = state.incidents.find((i) => i.verificationStatus === "verified") ?? state.incidents[0];
        if (target) {
          await api.tamperEvidence(target.id, "red_team_splice");
          setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${target.id} evidence spliced — anchored hash mismatch exposed`]);
        } else {
          setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] no evidence available to splice — skipping`]);
        }
      },
    },
    {
      label: "PHASE 3 · DDoS a verifier node",
      run: async () => {
        const node = state.nodes.find((n) => n.status === "active" && n.role !== "storage") ?? state.nodes[0];
        if (node) await api.nodeFailover(node.id);
        setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${node?.id ?? "?"} verifier overwhelmed — consensus re-routed to highest-stake node`]);
      },
    },
    {
      label: "PHASE 4 · Ghost entry through vault zone",
      run: async () => {
        await api.createIncident({
          cameraId: state.cameras[0]?.id ?? "CAM-001",
          type: "restricted_entry",
          title: "Red Team: ghost entry in vault zone",
          severity: "critical",
          riskScore: 97,
          description: "red team exercise — restricted zone breach with full attack chain",
          source: "simulated",
          zone: "vault",
          frames: 22,
        });
        setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ghost entry detected — full pipeline: hash → anchor → 3-agent quorum`]);
      },
    },
  ];

  const running = phase >= 0 && phase < phases.length;
  const complete = phase === phases.length;

  const start = async () => {
    setLog([`[${new Date().toLocaleTimeString()}] RED TEAM MODE engaged — target: Chain Sentry mesh`]);
    setPhase(0);
    toast("RED TEAM MODE engaged — watch the defense stack respond", "critical");
    for (let i = 0; i < phases.length; i++) {
      setPhase(i);
      try {
        await phases[i].run();
      } catch {
        setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] phase ${i + 1} error — continuing`]);
      }
      await new Promise((r) => setTimeout(r, 1600));
    }
    setPhase(phases.length);
    refresh();
    setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] EXERCISE COMPLETE — network held. every layer responded.`]);
    toast("Red Team exercise complete — network held. Every layer responded.", "success");
  };

  return (
    <>
      <Btn variant="dark" onClick={() => setOpen(true)}>
        <Skull size={14} className="text-rose-400" /> Red Team Mode
      </Btn>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md overflow-y-auto"
            onClick={() => !running && setOpen(false)}
          >
            <div className="min-h-full flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              className="w-full max-w-lg rounded-2xl border-2 border-rose-500/60 shadow-[0_0_60px_-12px_rgba(225,29,72,.6)]"
              style={{ background: "#0f172a" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-rose-500/30 rounded-t-2xl" style={{ background: "linear-gradient(135deg, #1e1b2e, #0f172a)" }}>
                <div className="h-11 w-11 rounded-xl bg-rose-600 grid place-items-center shadow-[0_0_24px_-4px_rgba(225,29,72,.8)]">
                  <Skull size={20} className="text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="font-black text-lg text-white tracking-tight">RED TEAM MODE</h2>
                  <p className="text-[11px] text-rose-300 font-semibold">Scripted attack run — every defense layer fires live</p>
                </div>
                {!running && (
                  <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
                )}
              </div>

              {/* phases */}
              <div className="px-5 pt-4 pb-2 space-y-2">
                {phases.map((p, i) => {
                  const done = phase > i || complete;
                  const active = phase === i;
                  return (
                    <motion.div
                      key={p.label}
                      animate={active ? { x: [0, -3, 3, -2, 2, 0] } : { x: 0 }}
                      transition={{ duration: 0.45 }}
                      className={`rounded-xl border px-4 py-3 text-sm font-bold flex items-center gap-2.5 ${
                        done ? "border-lime-400/50 bg-lime-400/10 text-lime-300"
                        : active ? "border-rose-400/70 bg-rose-500/15 text-rose-300 alert-flash"
                        : "border-slate-600/60 bg-slate-800/50 text-slate-500"
                      }`}
                    >
                      <span className={`h-6 w-6 rounded-lg grid place-items-center text-[11px] font-black ${
                        done ? "bg-lime-400/20 text-lime-300" : active ? "bg-rose-500/25 text-rose-300" : "bg-slate-700/50"
                      }`}>
                        {done ? <ShieldCheck size={13} /> : i + 1}
                      </span>
                      {p.label}
                      {active && <span className="ml-auto text-[10px] font-black pulse-dot">RUNNING…</span>}
                    </motion.div>
                  );
                })}
              </div>

              {/* terminal */}
              <div className="mx-5 mt-2 rounded-xl bg-black/70 border border-slate-700 p-3 max-h-40 overflow-auto">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Terminal size={11} className="text-cyan-400" />
                  <span className="mono text-[9px] font-bold tracking-[0.2em] text-slate-500">ATTACK LOG</span>
                </div>
                {log.length === 0 && <div className="mono text-[10px] text-slate-600">// awaiting engagement…</div>}
                {log.map((l, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="mono text-[10px] leading-relaxed text-emerald-300">
                    <span className="text-slate-600">$</span> {l}
                  </motion.div>
                ))}
              </div>

              {/* actions */}
              <div className="px-5 py-4 flex items-center gap-2.5 rounded-b-2xl">
                <Btn variant="danger" onClick={start} disabled={running}>
                  {running ? "ATTACK IN PROGRESS…" : complete ? "Run again" : "Engage attack"}
                </Btn>
                {!running && <Btn variant="ghost" onClick={() => setOpen(false)}>Close</Btn>}
                {running && <span className="text-xs text-rose-400 font-black pulse-dot">defense stack responding…</span>}
              </div>
            </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
