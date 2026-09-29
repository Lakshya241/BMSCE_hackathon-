"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Cctv, Siren, FileLock2, Link2, Server, Activity, Settings as SettingsIcon, ShieldCheck, ArrowLeft, Radio, Users, Clapperboard,
} from "lucide-react";
import { DashboardProvider, useDashboard } from "@/components/DashboardProvider";
import { StatusDot } from "@/components/ui";
import { GuideBot } from "@/components/GuideBot";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/lab", label: "Detection Lab", icon: Cctv },
  { href: "/dashboard/family", label: "Family Vault", icon: Users },
  { href: "/dashboard/booth", label: "Recording Booth", icon: Clapperboard },
  { href: "/dashboard/cameras", label: "Cameras", icon: Cctv },
  { href: "/dashboard/incidents", label: "Incidents", icon: Siren },
  { href: "/dashboard/evidence", label: "Evidence Vault", icon: FileLock2 },
  { href: "/dashboard/blockchain", label: "MST Blockchain", icon: Link2 },
  { href: "/dashboard/nodes", label: "Node Mesh", icon: Server },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
];

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { state, connected } = useDashboard();
  const bc = state.blockchain;
  const unack = state.alerts.filter((a) => !a.acknowledged).length;
  const onlineCams = state.cameras.filter((c) => c.status === "online").length;

  return (
    <div className="min-h-screen flex grid-bg">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white/85 backdrop-blur-xl flex flex-col sticky top-0 h-screen">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-slate-200">
          <div className="h-9 w-9 rounded-xl bg-cyan-600 grid place-items-center">
            <ShieldCheck size={17} className="text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-extrabold text-sm text-slate-900">Chain<span className="text-cyan-700">Sentry</span></div>
            <div className="text-[10px] text-slate-500 tracking-wider uppercase font-semibold">Security Console</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => {
            const active = path === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                  active
                    ? "bg-cyan-600 text-white shadow-[0_6px_18px_-6px_rgba(8,145,178,.6)]"
                    : "text-slate-600 hover:bg-cyan-50 hover:text-cyan-800"
                }`}
              >
                <n.icon size={15} />
                <span className="flex-1">{n.label}</span>
                {n.label === "Incidents" && unack > 0 && (
                  <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${active ? "bg-white/20" : "bg-rose-100 text-rose-600"}`}>{unack}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-200">
          <Link href="/" className="flex items-center gap-2 text-xs text-slate-500 hover:text-cyan-700 px-3 py-2 font-medium">
            <ArrowLeft size={13} /> Back to site
          </Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="h-14 border-b border-slate-200 bg-white/80 backdrop-blur-xl sticky top-0 z-40 flex items-center gap-4 px-6 text-xs font-semibold">
          <span className={`inline-flex items-center gap-1.5 chip ${connected ? "bg-lime-50 text-lime-700" : "bg-rose-50 text-rose-600"}`}>
            <Radio size={11} className={connected ? "glow-pulse" : ""} /> {connected ? "LIVE FEED" : "POLLING"}
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <StatusDot status={onlineCams > 0 ? "online" : "offline"} /> {onlineCams} cameras online
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <StatusDot status="online" /> AI engine active
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <StatusDot status={bc?.mode === "live" ? "online" : "pending"} />
            {bc?.network ?? "MST"} {bc?.mode === "live" ? "(live)" : "(demo)"}
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <StatusDot status={unack > 0 ? "pending" : "confirmed"} /> {unack} open alerts
          </span>
          <div className="flex-1" />
          <span className="mono text-slate-400">{state.serverTime ? new Date(state.serverTime).toLocaleTimeString() : ""}</span>
        </header>
        <main className="p-6 max-w-[1400px]">{children}</main>
      </div>
      <GuideBot />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <Shell>{children}</Shell>
    </DashboardProvider>
  );
}
