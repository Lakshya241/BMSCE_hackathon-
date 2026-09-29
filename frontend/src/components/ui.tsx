"use client";

import type { Severity } from "@/lib/types";

export function StatusDot({ status }: { status: string }) {
  const color =
    status === "online" || status === "active" || status === "verified" || status === "confirmed"
      ? "#65a30d"
      : status === "degraded" || status === "syncing" || status === "pending"
        ? "#d97706"
        : status === "offline" || status === "compromised" || status === "failed" || status === "rejected"
          ? "#e11d48"
          : "#94a3b8";
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full rounded-full pulse-dot" style={{ background: color }} />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function SevBadge({ severity }: { severity: Severity | string }) {
  return <span className={`chip chip-${severity}`}>{severity}</span>;
}

export function ModeBadge({ mode }: { mode: string }) {
  const demo = mode === "demo";
  return (
    <span
      className={`chip border ${
        demo ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-lime-50 text-lime-700 border-lime-300"
      }`}
    >
      {demo ? "SIMULATED / DEMO" : "LIVE ON-CHAIN"}
    </span>
  );
}

export function StatTile({ label, value, sub, accent = "#0891b2" }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="card card-hover p-4 flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold">{label}</span>
      <span className="text-2xl font-extrabold" style={{ color: accent }}>{value}</span>
      {sub ? <span className="text-[11px] text-slate-500">{sub}</span> : null}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "success" | "dark";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-cyan-600 text-white hover:bg-cyan-700 shadow-[0_6px_20px_-6px_rgba(8,145,178,.6)]",
    dark: "bg-slate-900 text-white hover:bg-slate-800 shadow-[0_6px_20px_-6px_rgba(15,23,42,.5)]",
    ghost: "bg-white text-slate-700 border border-slate-200 hover:border-cyan-400 hover:text-cyan-700",
    danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-[0_6px_20px_-6px_rgba(225,29,72,.55)]",
    success: "bg-lime-600 text-white hover:bg-lime-700 shadow-[0_6px_20px_-6px_rgba(101,163,13,.55)]",
  } as const;
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function shortHash(hash: string, size = 10): string {
  if (!hash) return "";
  return `${hash.slice(0, size)}…${hash.slice(-4)}`;
}
