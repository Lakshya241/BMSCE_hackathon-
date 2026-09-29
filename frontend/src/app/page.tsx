"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShieldCheck, Cctv, Fingerprint, Link2, Radar, Bot, FileLock2, Network, ScanEye, Zap, ArrowRight,
  CheckCircle2, XOctagon, Radio, Orbit, Building2, Dna, Globe2, Volume2, VolumeX,
} from "lucide-react";
import { useLive } from "@/lib/api";
import { CountUp, HashRain, Scramble, Spotlight, TiltCard, AlertVignette, ScrollProgress, sfx, speak } from "@/components/fx";
import { OpsRadar } from "@/components/OpsRadar";
import { GuideBot } from "@/components/GuideBot";
import type { HeroState } from "@/components/HeroScene";

const HeroScene = dynamic(() => import("@/components/HeroScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-cyan-700/60 text-sm">initializing 3D scene…</div>,
});
const IncidentConstellation = dynamic(() => import("@/components/Scene3D").then((m) => m.IncidentConstellation), { ssr: false });
const CameraCity = dynamic(() => import("@/components/Scene3D").then((m) => m.CameraCity), { ssr: false });
const BlockchainHelix = dynamic(() => import("@/components/Scene3D").then((m) => m.BlockchainHelix), { ssr: false });
const NodeGlobe = dynamic(() => import("@/components/Scene3D").then((m) => m.NodeGlobe), { ssr: false });

const PIPE_STEPS = [
  { icon: Cctv, label: "Camera", desc: "Webcam · upload · simulated CCTV · OpenCV service" },
  { icon: ScanEye, label: "AI Vision", desc: "Motion · person · zone · tripwire · tamper" },
  { icon: Fingerprint, label: "Evidence Hash", desc: "Real SHA-256 digest at capture time" },
  { icon: Link2, label: "MST Anchor", desc: "Immutable on-chain proof (backend-signed)" },
  { icon: ShieldCheck, label: "Verification", desc: "3-agent quorum · tamper-evident forever" },
];

const PROBLEMS = [
  { title: "Footage can be altered", desc: "DVR clips are trivially edited or deleted. Nobody can prove what is real.", icon: XOctagon },
  { title: "Motion alerts are noise", desc: "Naive detectors fire on shadows, rain and headlight sweeps.", icon: Radar },
  { title: "One server owns the truth", desc: "Centralized NVRs are a single point of failure — and of trust.", icon: Network },
  { title: "Cameras get attacked", desc: "Jammed, blocked or spoofed cameras silently go blind.", icon: Zap },
];

const SOLUTIONS = [
  { title: "AI incident detection", desc: "Context-aware filtering — zones, tripwires, dwell time and risk scoring cut false alarms.", icon: ScanEye },
  { title: "Cryptographic evidence", desc: "Every incident sealed with a real SHA-256 digest the instant it happens.", icon: Fingerprint },
  { title: "MST blockchain anchoring", desc: "Backend signs and anchors lightweight hashes — never video — on the MST testnet.", icon: Link2 },
  { title: "Multi-agent verification", desc: "Vision, Behavior and Context agents reach quorum before anything is 'verified'.", icon: Bot },
  { title: "Tamper-evident storage", desc: "Change one byte after anchoring and the hash mismatch exposes it instantly.", icon: FileLock2 },
  { title: "Decentralized node mesh", desc: "Verifier nodes fail over — no single camera or server owns the truth.", icon: Network },
];

const FEATURES = [
  ["Incident Constellation", "Every incident in the DB is a live star in an orbitable 3D galaxy."],
  ["Holographic Camera City", "A neon city where each building is a camera — lights die on tamper."],
  ["Blockchain Helix", "A rotating double helix built from your real MST transactions."],
  ["Node Globe", "Wireframe earth with pulsing node pings and animated consensus arcs."],
  ["Live ops radar", "Incidents as expanding blips pinned to camera sectors in real time."],
  ["Red Team Mode", "One click runs a scripted heist: jam → splice → DDoS → ghost entry."],
  ["⌘K command palette", "Fire every action from the keyboard, fuzzy-searched."],
  ["Hash snowflakes", "Every SHA-256 rendered as a unique fingerprint identicon."],
];

export default function Landing() {
  const { snapshot, events, connected } = useLive();
  const [heroState, setHeroState] = useState<HeroState>("idle");
  const [demoText, setDemoText] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [criticalHit, setCriticalHit] = useState(false);
  const [rainKick, setRainKick] = useState(0);
  const lastEventTs = useRef<string>("");

  // live events → hero cinema + sfx + voice + vignette + hash-rain kick
  useEffect(() => {
    const last = events[0];
    if (!last || last.timestamp === lastEventTs.current) return;
    lastEventTs.current = last.timestamp;

    if (last.kind === "incident_created" || last.kind === "tamper_detected" || last.kind === "camera_tamper") {
      setDemoText(null);
      setHeroState("alert");
      setRainKick((k) => k + 1);
      sfx.alert();
      if (last.level === "critical") {
        setCriticalHit(true);
        setTimeout(() => setCriticalHit(false), 1200);
        speak("Critical alert. " + last.message.replace(/[🚨⚠⚡]/g, ""), voiceOn);
      }
    } else if (last.kind === "agent_vote" || last.kind === "tx_submitted") {
      setHeroState((s) => (s === "alert" ? "verifying" : s));
      sfx.tick();
    } else if (last.kind === "tx_confirmed" || last.kind === "verification_complete") {
      if (last.message.includes("CONFIRMED") || last.message.includes("CONFIRMED 3")) {
        setHeroState("verified");
        setDemoText("EVIDENCE VERIFIED — proof anchored on MST Testnet");
        sfx.verify();
        speak("Evidence verified. Consensus reached.", voiceOn);
        setTimeout(() => setHeroState("idle"), 5200);
      }
    }
  }, [events, voiceOn]);

  const bc = snapshot?.blockchain;
  const stats = snapshot?.stats;
  const critical = events[0]?.level === "critical";

  return (
    <main className="relative overflow-x-hidden">
      <ScrollProgress />
      <AlertVignette active={criticalHit} />
      <GuideBot />
      {critical && <Spotlight color="rgba(225,29,72,.12)" />}

      {/* nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-cyan-600 grid place-items-center glow-cyan spin-slow" style={{ animationDuration: "14s" }}>
              <ShieldCheck size={18} className="text-white" />
            </div>
            <span className="font-extrabold tracking-tight text-lg text-slate-900">
              Chain<span className="text-cyan-700">Sentry</span>
            </span>
            <span className={`ml-2 hidden sm:inline-flex items-center gap-1.5 chip ${connected ? "bg-lime-50 text-lime-700" : "bg-rose-50 text-rose-600"}`}>
              <Radio size={11} className={connected ? "glow-pulse" : ""} /> {connected ? "LIVE" : "offline"}
            </span>
          </div>
          <div className="hidden md:flex items-center gap-7 text-sm text-slate-600 font-medium">
            <a href="#galaxy" className="hover:text-cyan-700 transition-colors">Galaxy</a>
            <a href="#pipeline" className="hover:text-cyan-700 transition-colors">Pipeline</a>
            <a href="#city" className="hover:text-cyan-700 transition-colors">City</a>
            <a href="#radar" className="hover:text-cyan-700 transition-colors">Radar</a>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setVoiceOn(!voiceOn); if (!voiceOn) speak("Voice alerts enabled.", true); }}
              title="Toggle voice alerts"
              className={`h-9 w-9 rounded-xl grid place-items-center border transition-all ${voiceOn ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-500 border-slate-200 hover:border-cyan-400"}`}
            >
              {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <Link href="/dashboard" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-all shadow-lg">
              Launch Console →
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <section className="relative min-h-[94vh] grid-bg flex items-center pt-16">
        <Spotlight />
        <HashRain active={rainKick > 0} opacity={0.07} />
        <div className="mx-auto max-w-7xl px-6 py-16 grid lg:grid-cols-2 gap-8 items-center w-full relative z-10">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3.5 py-1.5 text-xs font-semibold text-cyan-700 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 pulse-dot" />
              {bc ? `${bc.network} · ${bc.mode === "live" ? "LIVE anchoring" : "demo anchoring active"}` : "connecting to backend…"}
            </div>
            <h1 className="text-5xl md:text-6xl font-black leading-[1.03] tracking-tight text-slate-900">
              See the incident.
              <br />
              Prove the <span className="gradient-text"><Scramble text="evidence" /></span>.
              <br />
              Trust the <span className="text-indigo-600">chain</span>.
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-lg leading-relaxed">
              An AI-powered decentralized evidence network — detected by computer vision, sealed with SHA-256,
              anchored on the MST blockchain, streamed live over WebSockets.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/dashboard" className="btn-shine rounded-2xl bg-cyan-600 px-7 py-3.5 font-bold text-white hover:bg-cyan-700 transition-all glow-cyan inline-flex items-center gap-2">
                Open Live Console <ArrowRight size={18} />
              </Link>
              <Link href="/dashboard" className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-7 py-3.5 font-bold text-rose-600 hover:border-rose-400 hover:bg-rose-100 transition-all">
                ▶ Run 60-second proof
              </Link>
            </div>
            <div className="mt-8 flex gap-8 text-sm">
              {[
                ["cameras online", <><CountUp value={snapshot?.cameras.filter((c) => c.status === "online").length ?? 0} />/{snapshot?.cameras.length ?? 0}</>],
                ["incidents", <CountUp value={stats?.totalIncidents ?? 0} />],
                ["MST txs", <><CountUp value={stats?.confirmedTx ?? 0} />/{stats?.totalTx ?? 0}</>],
                ["verified", <CountUp value={stats?.verified ?? 0} />],
              ].map(([k, v], i) => (
                <motion.div key={k as string} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.1 }}>
                  <div className="text-2xl font-black text-slate-900 tabular-nums">{v}</div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{k}</div>
                </motion.div>
              ))}
            </div>
            {demoText && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border-2 border-lime-300 bg-lime-50 px-4 py-2.5 text-sm font-bold text-lime-700 glow-green">
                <CheckCircle2 size={16} /> {demoText}
              </motion.div>
            )}
          </motion.div>

          <div className="relative h-[460px] md:h-[580px]">
            <HeroScene state={heroState} />
            <AnimatePresence>
              {heroState === "verified" && (
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-2xl border-2 border-lime-400 bg-white/90 px-6 py-3 backdrop-blur">
                  <span className="text-lime-700 font-black tracking-[0.28em]">EVIDENCE VERIFIED</span>
                </motion.div>
              )}
              {heroState === "alert" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-2xl border-2 border-rose-400 bg-white/90 px-6 py-3 backdrop-blur">
                  <span className="text-rose-600 font-black tracking-[0.28em] glitching" data-text="INCIDENT DETECTED">INCIDENT DETECTED</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ticker */}
      <div className="border-y border-slate-200 bg-white py-3 overflow-hidden relative">
        <div className="ticker whitespace-nowrap text-xs font-semibold tracking-[0.22em] text-slate-500 uppercase flex gap-12 w-max">
          {[0, 1].map((copy) => (
            <span key={copy} className="flex gap-12">
              <span>● SHA-256 evidence digests</span><span>● MST testnet anchoring</span>
              <span>● 3-agent verification quorum</span><span>● Tamper-evident by construction</span>
              <span>● Live WebSocket telemetry</span><span>● DePIN camera mesh</span>
              <span>● Incident constellation</span><span>● Red team ready</span>
            </span>
          ))}
        </div>
      </div>

      {/* ============ INCIDENT CONSTELLATION ============ */}
      <section id="galaxy" className="relative bg-slate-950 py-24 overflow-hidden">
        <HashRain active={rainKick > 0} opacity={0.1} />
        <div className="mx-auto max-w-7xl px-6 relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Orbit size={16} className="text-cyan-400" />
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-400 font-bold">Incident Constellation — live from the database</p>
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-4 text-white"><Scramble text="Every incident becomes a star" /></h2>
          <p className="text-slate-400 max-w-2xl mb-8">
            Severity sets the color. Risk sets the brightness. New incidents birth a star with a supernova ring —
            in real time, over the WebSocket. This is your actual incident history, orbiting.
          </p>
          <div className="rounded-3xl border border-slate-700 bg-slate-900/60 overflow-hidden h-[420px] relative">
            <IncidentConstellation incidents={snapshot?.incidents ?? []} />
            <div className="absolute top-4 left-4 flex gap-2 text-[10px] font-bold">
              {[["low", "#22d3ee"], ["medium", "#f59e0b"], ["high", "#f97316"], ["critical", "#e11d48"]].map(([s, c]) => (
                <span key={s} className="flex items-center gap-1.5 text-slate-300">
                  <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {s}
                </span>
              ))}
            </div>
            <div className="absolute bottom-4 right-4 mono text-[10px] text-slate-500">
              {snapshot?.incidents.length ?? 0} stars · drag not needed — it's alive
            </div>
          </div>
        </div>
      </section>

      {/* pipeline + helix */}
      <section id="pipeline" className="mx-auto max-w-7xl px-6 py-24">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-700 font-bold mb-3">How it works</p>
        <h2 className="text-3xl md:text-4xl font-black mb-4 text-slate-900"><Scramble text="From photon to proof in five steps" /></h2>
        <p className="text-slate-600 max-w-2xl mb-12">Every stage is real and inspectable in the console — nothing on this page is a mock-up.</p>
        <div className="grid lg:grid-cols-[1fr_420px] gap-8 items-center">
          <div className="grid md:grid-cols-2 gap-4">
            {PIPE_STEPS.map((s, i) => (
              <TiltCard key={s.label} className={`card p-5 relative overflow-hidden ${i === 4 ? "md:col-span-2" : ""}`}>
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-cyan-100/70 blur-xl" />
                <span className="absolute top-4 right-4 text-[10px] font-mono text-slate-400">0{i + 1}</span>
                <div className="h-10 w-10 rounded-xl bg-cyan-600 grid place-items-center mb-3 floaty" style={{ animationDelay: `${i * 0.4}s` }}>
                  <s.icon size={19} className="text-white" />
                </div>
                <h3 className="font-extrabold mb-1 text-slate-900">{s.label}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{s.desc}</p>
              </TiltCard>
            ))}
          </div>
          {/* Blockchain helix built from real txs */}
          <div className="rounded-3xl border border-slate-200 bg-slate-950 h-[460px] relative overflow-hidden">
            <BlockchainHelix transactions={snapshot?.transactions ?? []} />
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <Dna size={14} className="text-cyan-400" />
              <span className="text-[10px] font-bold tracking-[0.2em] text-cyan-400 uppercase">Tx Helix · {snapshot?.transactions.length ?? 0} blocks</span>
            </div>
          </div>
        </div>
      </section>

      {/* problems */}
      <section className="border-y border-slate-200 bg-white py-24">
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-rose-600 font-bold mb-3">The problem</p>
          <h2 className="text-3xl md:text-4xl font-black mb-12 text-slate-900">Surveillance today proves nothing</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PROBLEMS.map((p, i) => (
              <TiltCard key={p.title} className="card p-6 border-rose-200">
                <div className="h-10 w-10 rounded-xl bg-rose-100 grid place-items-center mb-3"><p.icon size={19} className="text-rose-600" /></div>
                <h3 className="font-extrabold mb-1.5 text-slate-900">{p.title}</h3>
                <p className="text-sm text-slate-600">{p.desc}</p>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* solutions */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <p className="text-xs uppercase tracking-[0.3em] text-lime-700 font-bold mb-3">The solution</p>
        <h2 className="text-3xl md:text-4xl font-black mb-12 text-slate-900">A network that can prove what happened</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SOLUTIONS.map((s, i) => (
            <TiltCard key={s.title} className="card card-hover p-6">
              <div className="h-10 w-10 rounded-xl bg-slate-900 grid place-items-center mb-3"><s.icon size={18} className="text-lime-300" /></div>
              <h3 className="font-extrabold mb-1.5 text-slate-900">{s.title}</h3>
              <p className="text-sm text-slate-600">{s.desc}</p>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* ============ CAMERA CITY + NODE GLOBE ============ */}
      <section id="city" className="bg-slate-950 py-24 overflow-hidden">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={16} className="text-teal-400" />
            <p className="text-xs uppercase tracking-[0.3em] text-teal-400 font-bold">Holographic camera city · node globe</p>
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-4 text-white"><Scramble text="Watch your fleet as a living city" /></h2>
          <p className="text-slate-400 max-w-2xl mb-10">
            Each tower is a real camera. Armed towers glow teal; attacked towers go red and their lights die.
            Next to it, your DePIN mesh orbits a wireframe earth with live consensus arcs.
          </p>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-3xl border border-slate-700 bg-slate-900/60 h-[380px] relative overflow-hidden">
              <CameraCity cameras={snapshot?.cameras ?? []} />
              <div className="absolute top-4 left-4 text-[10px] font-bold tracking-[0.2em] text-teal-400 uppercase">City of {snapshot?.cameras.length ?? 0} cameras</div>
            </div>
            <div className="rounded-3xl border border-slate-700 bg-slate-900/60 h-[380px] relative overflow-hidden">
              <NodeGlobe nodes={snapshot?.nodes ?? []} />
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <Globe2 size={14} className="text-indigo-400" />
                <span className="text-[10px] font-bold tracking-[0.2em] text-indigo-400 uppercase">Mesh globe · {snapshot?.nodes.length ?? 0} nodes</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ RADAR + LIVE FEED ============ */}
      <section id="radar" className="border-y border-slate-200 bg-white py-24">
        <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-700 font-bold mb-3">Ops radar</p>
            <h2 className="text-3xl md:text-4xl font-black mb-4 text-slate-900"><Scramble text="Every blip is a real incident" /></h2>
            <p className="text-slate-600 mb-6 max-w-lg">
              Pinned to camera sectors, expanding on arrival, synced with the backend event stream.
              When the sweep passes a fresh breach, you'll know before the toast lands.
            </p>
            <div className="flex gap-6">
              {[
                ["events streamed", events.length],
                ["critical", events.filter((e) => e.level === "critical").length],
                ["anchors", events.filter((e) => e.kind === "tx_confirmed").length],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <div className="text-2xl font-black text-slate-900"><CountUp value={v as number} /></div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{k}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-6 border-2 border-cyan-100">
            <OpsRadar cameras={snapshot?.cameras ?? []} incidents={snapshot?.incidents ?? []} size={320} />
          </div>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <p className="text-xs uppercase tracking-[0.3em] text-indigo-600 font-bold mb-3">The crazy list</p>
        <h2 className="text-3xl md:text-4xl font-black mb-12 text-slate-900">Everything works. Click it and see.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 rounded-3xl overflow-hidden border border-slate-200">
          {FEATURES.map(([title, desc]) => (
            <TiltCard key={title} className="bg-white p-6 hover:bg-cyan-50 transition-colors !rounded-none">
              <CheckCircle2 size={16} className="text-cyan-700 mb-3" />
              <h3 className="font-bold text-sm mb-1 text-slate-900">{title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-28 text-center relative">
        <Spotlight color="rgba(79,70,229,.10)" />
        <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-4xl md:text-5xl font-black mb-4 text-slate-900">
          Run the 60-second proof
        </motion.h2>
        <p className="text-slate-600 max-w-xl mx-auto mb-10">
          Simulate an incident → 3 agents vote live → SHA-256 anchor lands on MST → tamper the evidence → the chain rejects it.
          Then unleash <span className="font-bold text-rose-600">Red Team Mode</span> and watch every layer fight back.
        </p>
        <Link href="/dashboard" className="inline-flex items-center gap-3 rounded-2xl bg-cyan-600 px-9 py-4 text-lg font-bold text-white hover:bg-cyan-700 transition-all glow-cyan">
          Launch Chain Sentry Console <ArrowRight size={20} />
        </Link>
        <p className="mt-6 text-xs text-slate-500">
          No wallet required — the backend anchors in clearly-labeled demo mode until MST credentials are configured.
        </p>
      </section>

      <footer className="border-t border-slate-200 py-10 bg-white">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-cyan-700" />
            Chain Sentry — Decentralized AI Surveillance & Tamper-Evident Evidence Network
          </div>
          <div className="font-semibold">See the incident. Prove the evidence. Trust the chain.</div>
        </div>
      </footer>
    </main>
  );
}
