"use client";

import { useEffect, useMemo, useState } from "react";
import type { Camera, Incident } from "@/lib/types";

/** Live ops radar — incidents appear as blips pinned to their camera sector. */
export function OpsRadar({ cameras, incidents, size = 280 }: { cameras: Camera[]; incidents: Incident[]; size?: number }) {
  const [sweep, setSweep] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setSweep((s) => (s + 2) % 360), 40);
    return () => clearInterval(iv);
  }, []);

  const blips = useMemo(() => {
    return incidents.slice(0, 10).map((inc, i) => {
      const camIdx = Math.max(0, cameras.findIndex((c) => c.id === inc.cameraId));
      const base = (camIdx / Math.max(1, cameras.length || 1)) * 360;
      const angle = ((base + i * 13) % 360) * (Math.PI / 180);
      const dist = 26 + ((i * 29) % 60); // px from center
      return {
        id: inc.id,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        sev: inc.severity,
        label: inc.cameraId,
      };
    });
  }, [incidents, cameras]);

  const sevColor: Record<string, string> = {
    low: "#0891b2",
    medium: "#d97706",
    high: "#ea580c",
    critical: "#e11d48",
  };

  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 10;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      <defs>
        <radialGradient id="radarBg" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="100%" stopColor="#f0f9ff" />
        </radialGradient>
        <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(8,145,178,0)" />
          <stop offset="100%" stopColor="rgba(8,145,178,0.55)" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="url(#radarBg)" stroke="#bae6fd" strokeWidth="1.5" />
      {[0.33, 0.66].map((f) => (
        <circle key={f} cx={cx} cy={cy} r={R * f} fill="none" stroke="#e0f2fe" strokeWidth="1" />
      ))}
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="#e0f2fe" />
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="#e0f2fe" />
      {/* sweep */}
      <g transform={`rotate(${sweep} ${cx} ${cy})`}>
        <path d={`M ${cx} ${cy} L ${cx + R} ${cy} A ${R} ${R} 0 0 0 ${cx + R * Math.cos(-0.5)} ${cy + R * Math.sin(-0.5)} Z`} fill="url(#sweepGrad)" opacity={0.8} />
        <line x1={cx} y1={cy} x2={cx + R} y2={cy} stroke="#0891b2" strokeWidth="1.6" />
      </g>
      {/* blips */}
      {blips.map((b, i) => (
        <g key={b.id + i} transform={`translate(${cx + b.x} ${cy + b.y})`}>
          <circle r="5" fill={sevColor[b.sev]} stroke="#fff" strokeWidth="1.5" />
          <circle r="5" fill="none" stroke={sevColor[b.sev]} strokeWidth="1.5" opacity="0.5">
            <animate attributeName="r" values="5;16" dur="1.6s" repeatCount="indefinite" begin={`${i * 0.2}s`} />
            <animate attributeName="opacity" values="0.6;0" dur="1.6s" repeatCount="indefinite" begin={`${i * 0.2}s`} />
          </circle>
          <text y="-10" textAnchor="middle" fontSize="8" fontWeight="700" fill="#475569" fontFamily="ui-monospace, monospace">
            {b.label}
          </text>
        </g>
      ))}
      <text x={cx} y={size - 2} textAnchor="middle" fontSize="9" fontWeight="800" fill="#64748b" letterSpacing="2">
        LIVE SECTOR SCAN
      </text>
    </svg>
  );
}
