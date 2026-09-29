"use client";

import { useState } from "react";
import { Save, Info } from "lucide-react";
import { useDashboard } from "@/components/DashboardProvider";
import { Btn, shortHash } from "@/components/ui";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const { state, api, toast } = useDashboard();
  const s = state.settings;
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (Object.keys(draft).length === 0) {
      toast("Nothing to save");
      return;
    }
    await api.patchSettings(draft);
    setDraft({});
    toast("Settings saved to backend JSON store", "success");
  };
  const v = <K extends keyof Settings>(k: K): Settings[K] => (draft[k] !== undefined ? (draft[k] as Settings[K]) : s?.[k]);

  const bc = state.blockchain;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Detection and anchoring policy — persisted to backend/data/settings.json.</p>
      </div>

      <div className="card p-5 space-y-5">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500">Detection policy</h2>
        <Slider label="Motion sensitivity" value={v("motionSensitivity") ?? 65} min={1} max={100}
          onChange={(n) => set({ motionSensitivity: n })} hint="Higher = more sensitive frame-differencing in the Detection Lab." />
        <Slider label="Incident risk threshold" value={v("riskThreshold") ?? 55} min={20} max={95}
          onChange={(n) => set({ riskThreshold: n })} hint="Events scoring below this never become incidents (false-alarm filter)." />
        <Toggle label="System armed" checked={v("armed") ?? true} onChange={(b) => set({ armed: b })} hint="Global arm/disarm for the detection network." />
        <Toggle label="Auto-anchor evidence" checked={v("autoAnchor") ?? true} onChange={(b) => set({ autoAnchor: b })} hint="Anchor every new incident's hash to MST automatically." />
        <Toggle label="Privacy masking by default" checked={v("privacyMaskDefault") ?? false} onChange={(b) => set({ privacyMaskDefault: b })} hint="Blur person regions in captured packets for public spaces." />
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500">MST blockchain mode</h2>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className={`chip border ${bc?.mode === "live" ? "bg-lime-50 text-lime-700 border-lime-300" : "bg-amber-50 text-amber-700 border-amber-300"}`}>
            {bc?.mode === "live" ? "LIVE ON-CHAIN" : "DEMO MODE"}
          </span>
          <span className="text-xs text-slate-500 font-semibold">{bc?.network}</span>
          {bc?.walletAddress && <span className="mono text-[10px] text-slate-400">signer {shortHash(bc.walletAddress, 10)}</span>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-950 p-3 text-xs mono leading-relaxed text-slate-300">
          MST_RPC_URL={bc?.mode === "live" ? "•••configured•••" : "(empty)"}
          <br />
          MST_PRIVATE_KEY={bc?.mode === "live" ? "•••configured•••" : "(empty)"}
          <br />
          MST_CONTRACT_ADDRESS={bc?.contractAddress ?? "(empty)"}
        </div>
        <div className="flex items-start gap-2 text-xs text-slate-500">
          <Info size={13} className="mt-0.5 shrink-0" />
          Set these in <span className="mono text-slate-700">backend/.env</span> (see <span className="mono text-slate-700">backend/.env.example</span>) and restart the backend.
          Until then every transaction is computed with real SHA-256 and permanently labeled SIMULATED / DEMO.
        </div>
      </div>

      <div className="flex justify-end">
        <Btn onClick={save}><Save size={14} /> Save settings</Btn>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; hint?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        <span className="mono text-cyan-700 text-sm font-bold">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-cyan-600" />
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (b: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      </div>
      <button onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-cyan-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
