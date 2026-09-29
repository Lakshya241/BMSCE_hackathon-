"use client";

import { useState } from "react";
import { Plus, Trash2, ShieldAlert, Video } from "lucide-react";
import { useDashboard } from "@/components/DashboardProvider";
import { Btn, StatusDot, timeAgo } from "@/components/ui";
import type { Camera } from "@/lib/types";

export default function CamerasPage() {
  const { state, api, toast } = useDashboard();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", location: "" });

  const add = async () => {
    if (!form.name.trim() || !form.location.trim()) {
      toast("Name and location required");
      return;
    }
    await api.addCamera(form);
    setForm({ name: "", location: "" });
    setAdding(false);
    toast("Camera registered", "success");
  };

  const simulateTamper = async (cam: Camera) => {
    await api.patchCamera(cam.id, { status: "compromised", tamperCount: cam.tamperCount + 1 });
    toast(`⚠ ${cam.name}: tamper detected — mesh re-routing`, "critical");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Cameras</h1>
          <p className="text-sm text-slate-500">Fleet management — arm/disarm, health, tamper history.</p>
        </div>
        <Btn onClick={() => setAdding(!adding)}><Plus size={14} /> Register Camera</Btn>
      </div>

      {adding && (
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-500 font-semibold flex flex-col gap-1">
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rooftop North"
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm w-56 focus:border-cyan-500 outline-none text-slate-900" />
          </label>
          <label className="text-xs text-slate-500 font-semibold flex flex-col gap-1">
            Location
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Building C · Roof"
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm w-56 focus:border-cyan-500 outline-none text-slate-900" />
          </label>
          <Btn onClick={add}>Save</Btn>
          <Btn variant="ghost" onClick={() => setAdding(false)}>Cancel</Btn>
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {state.cameras.map((cam) => (
          <div key={cam.id} className={`card card-hover p-5 ${cam.status === "compromised" ? "border-rose-300 glow-red" : ""}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <StatusDot status={cam.status} />
                  <h3 className="font-extrabold text-slate-900">{cam.name}</h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 mono">{cam.id} · {cam.location} · {cam.model}</p>
              </div>
              <span className={`chip border ${cam.mode === "armed" ? "bg-lime-50 text-lime-700 border-lime-300" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                {cam.mode.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
              <div className="rounded-xl bg-slate-50 py-2 border border-slate-100">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Uptime</div>
                <div className="mono font-bold text-cyan-700">{cam.uptime}%</div>
              </div>
              <div className="rounded-xl bg-slate-50 py-2 border border-slate-100">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Latency</div>
                <div className="mono text-slate-700">{cam.latencyMs}ms</div>
              </div>
              <div className="rounded-xl bg-slate-50 py-2 border border-slate-100">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Tampers</div>
                <div className={`mono font-bold ${cam.tamperCount ? "text-rose-600" : "text-slate-700"}`}>{cam.tamperCount}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn variant={cam.mode === "armed" ? "success" : "ghost"}
                onClick={() => api.patchCamera(cam.id, { mode: cam.mode === "armed" ? "disarmed" : "armed" })}>
                {cam.mode === "armed" ? "Disarm" : "Arm"}
              </Btn>
              <Btn variant="ghost" onClick={() => api.patchCamera(cam.id, { status: cam.status === "offline" ? "online" : "offline" })}>
                <Video size={13} /> {cam.status === "offline" ? "Restore" : "Take offline"}
              </Btn>
              <Btn variant="danger" onClick={() => simulateTamper(cam)}><ShieldAlert size={13} /> Simulate tamper</Btn>
              <Btn variant="ghost" onClick={() => { api.removeCamera(cam.id); toast("Camera removed"); }}>
                <Trash2 size={13} />
              </Btn>
            </div>
            <p className="text-[10px] text-slate-400 mt-3">last seen {timeAgo(cam.lastSeen)}</p>
          </div>
        ))}
      </div>
      {state.cameras.length === 0 && (
        <div className="card p-10 text-center text-sm text-slate-500">No cameras registered. Add one above.</div>
      )}
    </div>
  );
}
