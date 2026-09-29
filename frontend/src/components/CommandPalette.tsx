"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Play, FileLock2, Zap, Skull, LayoutDashboard, Cctv, Siren, Link2, Server, Activity, Settings as SettingsIcon, Search,
} from "lucide-react";
import { useDashboard } from "./DashboardProvider";

interface Cmd {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  run: () => void | Promise<void>;
}

export function CommandPalette() {
  const router = useRouter();
  const { state, api, toast } = useDashboard();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Cmd[] = useMemo(() => {
    const nav = (href: string, label: string, icon: Cmd["icon"]): Cmd => ({
      id: `nav-${href}`, label, hint: "navigate", icon,
      run: () => router.push(href),
    });
    return [
      { id: "demo-incident", label: "Simulate Incident", hint: "demo · step 1", icon: Play, run: () => api.demoStep(0).then(() => toast("Incident simulated — watch agents vote live", "info")) },
      { id: "demo-tamper", label: "Simulate Evidence Tampering", hint: "demo · step 2", icon: FileLock2, run: () => api.demoStep(1).then(() => toast("Evidence tampered — chain rejected it", "critical")) },
      { id: "demo-camera", label: "Simulate Camera Attack", hint: "demo · step 3", icon: Zap, run: () => api.demoStep(2).then(() => toast("Camera attacked — mesh failover engaged", "high")) },
      { id: "tamper", label: "Tamper latest verified evidence", hint: "red team", icon: FileLock2, run: () => { const t = state.incidents.find((i) => i.verificationStatus === "verified"); if (t) return api.tamperEvidence(t.id).then(() => toast(`Tampered ${t.id}`, "critical")); toast("No verified incident yet", "high"); } },
      { id: "failover", label: "Kill a verifier node (failover)", hint: "mesh", icon: Server, run: () => { const n = state.nodes.find((x) => x.status === "active"); if (n) return api.nodeFailover(n.id).then(() => toast(`${n.name} down — duty reassigned`, "high")); } },
      { id: "ack", label: "Acknowledge all alerts", hint: "alerts", icon: Siren, run: () => api.ackAll().then(() => toast("All alerts acknowledged", "success")) },
      { id: "arm", label: state.settings?.armed ? "Disarm system" : "Arm system", hint: "policy", icon: SettingsIcon, run: () => api.patchSettings({ armed: !state.settings?.armed }).then(() => toast(state.settings?.armed ? "System disarmed" : "System armed", "info")) },
      nav("/dashboard", "Go to Overview", LayoutDashboard),
      nav("/dashboard/lab", "Go to Detection Lab", Cctv),
      nav("/dashboard/cameras", "Go to Cameras", Cctv),
      nav("/dashboard/incidents", "Go to Incidents", Siren),
      nav("/dashboard/evidence", "Go to Evidence Vault", FileLock2),
      nav("/dashboard/blockchain", "Go to MST Blockchain", Link2),
      nav("/dashboard/nodes", "Go to Node Mesh", Server),
      nav("/dashboard/activity", "Go to Activity Ledger", Activity),
      nav("/dashboard/settings", "Go to Settings", SettingsIcon),
    ];
  }, [api, router, state.incidents, state.nodes, state.settings?.armed, toast]);

  const filtered = useMemo(() => {
    if (!q.trim()) return commands;
    const ql = q.toLowerCase();
    return commands.filter((c) => (c.label + " " + c.hint).toLowerCase().includes(ql));
  }, [commands, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setSel(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  const exec = (c: Cmd) => {
    setOpen(false);
    void c.run();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-slate-950/50 backdrop-blur-sm pt-[14vh] px-4" onClick={() => setOpen(false)}>
          <motion.div
            initial={{ scale: 0.96, y: -12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }}
            className="card overflow-hidden w-full max-w-xl mx-auto border-2 border-cyan-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
              <Search size={16} className="text-cyan-700" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setSel(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
                  if (e.key === "Enter" && filtered[sel]) exec(filtered[sel]);
                }}
                placeholder="Type a command… (simulate, tamper, navigate…)"
                className="flex-1 bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400 font-medium"
              />
              <kbd className="chip bg-slate-100 text-slate-500 border border-slate-200">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-auto p-2">
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => exec(c)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors ${
                    i === sel ? "bg-cyan-600 text-white" : "text-slate-700 hover:bg-cyan-50"
                  }`}
                >
                  <c.icon size={15} />
                  <span className="text-sm font-semibold flex-1">{c.label}</span>
                  <span className={`text-[10px] mono font-bold uppercase ${i === sel ? "text-cyan-100" : "text-slate-400"}`}>{c.hint}</span>
                </button>
              ))}
              {filtered.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">No commands match “{q}”.</div>}
            </div>
            <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 font-semibold flex gap-4">
              <span>↑↓ navigate</span><span>⏎ execute</span><span>⌘K toggle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
