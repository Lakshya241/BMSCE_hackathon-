"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X, SendHorizontal, Sparkles } from "lucide-react";
import { useLive } from "@/lib/api";

interface Msg {
  from: "bot" | "user";
  text: string;
}

interface Intent {
  keys: string[];
  answer: (ctx: Live) => string;
}

type Live = ReturnType<typeof useLive>;

/* ---------------- knowledge base ---------------- */
const INTENTS: Intent[] = [
  {
    keys: ["what is", "what does", "about", "website", "site", "project", "do here", "tell me about"],
    answer: () =>
      "**Chain Sentry** is a decentralized AI surveillance & tamper-evident evidence network.\n\n" +
      "The flow: cameras (simulated, webcam, or OpenCV) → AI detection (motion, person, zones, tripwires, tamper) → " +
      "every incident is sealed with a real **SHA-256 hash** → anchored on the **MST blockchain** → verified by a " +
      "**3-agent quorum** (Vision / Behavior / Context) → streamed live to this console over WebSockets.\n\n" +
      "In short: *See the incident. Prove the evidence. Trust the chain.*",
  },
  {
    keys: ["hash", "sha", "digest", "evidence hashing"],
    answer: () =>
      "When an incident fires, its canonical packet `{id, cameraId, type, timestamp, frames, risk, detections}` is serialized " +
      "and hashed with **SHA-256** in the backend. That digest is stored as `originalHash` in evidence.json and anchored on MST.\n\n" +
      "If anyone later changes even one byte, `currentHash ≠ originalHash` → the vault instantly shows **TAMPERED** and a tamper " +
      "report tx goes on-chain. Try it: open the **Evidence Vault** and use the Independent Hash Verifier.",
  },
  {
    keys: ["verification", "agent", "quorum", "consensus", "vision", "behavior", "context"],
    answer: () =>
      "Three independent agents re-examine every incident's evidence packet:\n" +
      "• **Vision Agent** — validates the frame digest & packet consistency\n" +
      "• **Behavior Agent** — scores trajectory/dwell against the event signature\n" +
      "• **Context Agent** — checks zone context (abstains if there's none, keeping consensus honest)\n\n" +
      "**≥2 of 3 confirms → consensus.** Every vote streams live into the console (watch for `agent_vote` events). Same data ⇒ same consensus — it's deterministic and auditable.",
  },
  {
    keys: ["blockchain", "mst", "chain", "anchor", "on-chain", "onchain", "transaction", "tx"],
    answer: (live) => {
      const bc = live.snapshot?.blockchain;
      const s = live.snapshot?.stats;
      return (
        `All evidence hashes are anchored on the **MST blockchain** (EVM-compatible) by the backend — which is the only place private keys exist.\n\n` +
        `• Contract: \`ChainSentry.sol\` — anchorEvidence(incidentId, cameraId, evidenceHash, timestamp, eventType)\n` +
        `• Mode right now: **${bc?.mode === "live" ? "LIVE ON-CHAIN" : "SIMULATED / DEMO"}** (${bc?.network})\n` +
        `• Anchored proofs so far: **${s?.totalTx ?? 0} transactions** (${s?.confirmedTx ?? 0} confirmed)\n\n` +
        `Without MST credentials in backend/.env, demo txs are real SHA-256 digests but always labeled SIMULATED / DEMO — never faked as real. ` +
        `See the MST Blockchain tab for the tx viewer.`
      );
    },
  },
  {
    keys: ["tamper", "tampering", "fake", "edit", "modify", "alter"],
    answer: () =>
      "Tampering is the whole point of the chain. Two ways to see it:\n" +
      "1. **Demo Theater** (Overview) → click *Simulate Evidence Tampering* — the stored evidence mutates, the anchored hash mismatches, status flips to INVALID and a TAMPER_REPORT tx is recorded.\n" +
      "2. **Red Team Mode** → the splice phase does it as part of a full attack chain.\n\n" +
      "The Detection Lab also detects *camera* tamper in real time: blackout, occlusion, and frame-freeze signals.",
  },
  {
    keys: ["red team", "redteam", "heist", "attack mode"],
    answer: () =>
      "**Red Team Mode** (Overview, or ⌘K → Red Team) runs a scripted heist against the network:\n" +
      "1. Jams a camera feed (blackout detected)\n" +
      "2. Splices evidence (hash mismatch exposed)\n" +
      "3. DDoSes a verifier node (consensus re-routes)\n" +
      "4. Ghost entry in the vault zone (full pipeline fires)\n\n" +
      "You watch every defense layer respond live — like an attack in a movie, but every event is real and persisted.",
  },
  {
    keys: ["command", "cmd", "k palette", "shortcut", "keyboard"],
    answer: () => "Press **⌘K** (or Ctrl+K) anywhere in the console — a command palette opens with every action: simulate incidents, tamper evidence, kill nodes, navigate tabs, arm/disarm the system. Fuzzy search + arrow keys + enter.",
  },
  {
    keys: ["camera", "webcam", "video", "upload", "lab", "detection"],
    answer: () =>
      "The **Detection Lab** runs real computer vision in your browser with three sources:\n" +
      "• **Simulated CCTV** — a live canvas scene with walkers\n" +
      "• **Your webcam** — permission-based, real feed\n" +
      "• **Uploaded video** — any video file\n\n" +
      "Draw a **restricted zone** or a **tripwire** directly on the feed, adjust sensitivity, then watch risk scoring fuse motion + persons + zones. " +
      "Anything above threshold becomes a real incident → hash → anchor → verify. There's also a Python OpenCV service in backend/python for native streams.",
  },
  {
    keys: ["constellation", "galaxy", "star", "3d", "city", "globe", "helix"],
    answer: () =>
      "The landing page has **four live 3D structures** (React Three Fiber):\n" +
      "• **Incident Constellation** — every incident in the DB is a star (color = severity, size = risk)\n" +
      "• **Blockchain Helix** — a rotating double helix built from your real MST transactions\n" +
      "• **Holographic Camera City** — towers = cameras; they go red and die when tampered\n" +
      "• **Node Globe** — your DePIN mesh orbiting a wireframe earth with consensus arcs\n\n" +
      "All of them are fed by live backend data, not decorations.",
  },
  {
    keys: ["demo mode", "simulated", "fake tx", "live mode", "real chain", "env", "credential", "rpc", "private key"],
    answer: (live) =>
      `Current mode: **${live.snapshot?.blockchain.mode === "live" ? "LIVE ON-CHAIN" : "SIMULATED / DEMO"}**.\n\n` +
      "Demo mode needs nothing — txs are real SHA-256 digests, locally computed, permanently labeled SIMULATED / DEMO.\n\n" +
      "For live anchoring, set in backend/.env:\n`MST_RPC_URL`, `MST_PRIVATE_KEY`, `MST_CONTRACT_ADDRESS`, `MST_CHAIN_ID`, `MST_EXPLORER_URL`\n" +
      "then restart the backend. ethers v6 signs anchorEvidence() on the ChainSentry contract; MSTScan links appear on real txs. Keys never leave the server.",
  },
  {
    keys: ["node", "mesh", "failover", "depin", "validator", "verifier node"],
    answer: () =>
      "The **Node Mesh** tab shows the DePIN-style network: validators (outer ring), verifiers, storage and gateway nodes with stakes.\n\n" +
      "Click **Kill node** on any node — it goes offline and verification duty instantly re-routes to the highest-stake active node. " +
      "That's decentralization you can demo in one click. The globe on the landing page visualizes the same mesh.",
  },
  {
    keys: ["alert", "notify", "notification"],
    answer: () => "Critical/high incidents raise alerts three ways: toasts (bottom-right), the alert center with ack workflow, and — in critical cases — a full-screen red vignette + camera shake + spoken voice alert (toggle the speaker icon in the nav).",
  },
  {
    keys: ["tech", "stack", "built", "framework", "made with"],
    answer: () =>
      "**Frontend:** Next.js 15, React 19, TypeScript, Tailwind v4, Framer Motion, Three.js/R3F, Recharts.\n" +
      "**Backend:** Node + Express + ws (WebSockets), ethers v6 for MST, JSON-file storage (no external DB).\n" +
      "**CV:** browser canvas heuristics + optional Python OpenCV service (MOG2 + HOG).\n" +
      "**Chain:** Solidity ^0.8.24 contract, MST testnet.",
  },
  {
    keys: ["setup", "install", "run", "start", "how to", "npm"],
    answer: () =>
      "Two terminals:\n```\ncd backend && npm install && npm run seed && npm run dev\ncd frontend && npm install && npm run dev\n```\n" +
      "Backend: REST on :4000 + live WS on /ws. Frontend: http://localhost:3000 (REST is proxied via /backend/api). That's it — demo mode works out of the box.",
  },
  {
    keys: ["data", "json", "storage", "database", "persist"],
    answer: () =>
      "Everything persists to **11 JSON collections** in backend/data/ (cameras, incidents, evidence, transactions, verifications, alerts, nodes, activity, users, settings, analytics) — " +
      "all through one module exposing readJSON/writeJSON/updateJSON/appendJSON/deleteJSON/findById/updateById. Zero external databases, hackathon-grade simplicity, fully auditable.",
  },
  {
    keys: ["voice", "sound", "speak", "audio"],
    answer: () => "Flip the speaker icon in the landing nav: the console speaks critical alerts via the Web Speech API and plays synth blips on agent votes, anchors, and verifications. Pure browser APIs — nothing external.",
  },
  {
    keys: ["privacy", "mask", "blur"],
    answer: () => "Settings → *Privacy masking by default* blurs person regions in captured evidence packets — designed for public-space deployments where footage needs to be shareable without exposing faces.",
  },
  {
    keys: ["area mode", "restricted area", "public area", "intrusion", "alarm policy", "trespass"],
    answer: () =>
      "Three **area modes** in the Detection Lab:\n" +
      "• **FAMILY** 🏠 — alerts ONLY when a stranger is present *without* any family member. A stranger standing next to family = no alarm, no recording.\n" +
      "• **RESTRICTED** 🚫 — alarms on ANY presence: motion, any face, trespassing — even family members.\n" +
      "• **PUBLIC** 🌐 — never alarms. Every 10s frame is hash-chained (SHA-256 of prev digest + image); if anyone edits the video, the booth's **verify chain** button instantly flags which capture was altered.",
  },
  {
    keys: ["family", "face", "recogni", "vault photo", "relatives", "mother", "father", "home"],
    answer: (live) => {
      const n = live.snapshot?.family?.length ?? 0;
      return `The **Family Face Vault** stores only family photos (thumbnail + perceptual face signature — 5×5 luma grid + hue histogram, matched by cosine similarity ≥ 0.82).\n\nCurrently enrolled: **${n} member${n === 1 ? "" : "s"}**.\n\nThe **privacy gate** uses it: video is only stored while a *non-family* person is in frame. Family-only frames are suppressed — nothing is written. Enroll members in the Family Vault tab or straight from the Detection Lab.`;
    },
  },
  {
    keys: ["recording booth", "booth", "10 sec", "10s", "capture", "rolling", "footage"],
    answer: (live) => {
      const s = live.snapshot?.captureStats;
      return `The **Recording Booth** is the 10-second rolling store: every 10s the Detection Lab hashes the current frame (SHA-256) and posts it to the backend.\n\n• Heartbeats seen: **${s?.total ?? 0}**\n• Stored: **${s?.kept ?? 0}**\n• Suppressed (family only): **${s?.skippedPrivate ?? 0}**\n\nFrames land live over WebSocket with face boxes drawn — family (green) vs strangers (red). Only stranger-present frames are kept, per the privacy rule.`;
    },
  },
];

/* ---------------- live-data intents ---------------- */
const LIVE_INTENTS: Intent[] = [
  {
    keys: ["how many", "count", "number of"],
    answer: (live) => {
      const s = live.snapshot?.stats;
      const t = live.snapshot?.analytics;
      return `Right now, live from the backend:\n• Incidents: **${s?.totalIncidents ?? 0}** (${s?.activeIncidents ?? 0} active)\n• Verified evidence: **${s?.verified ?? 0}**\n• Tamper events: **${s?.tampered ?? 0}**\n• MST txs: **${s?.confirmedTx ?? 0}/${s?.totalTx ?? 0}** confirmed\n• Verification rate: **${t?.verificationRate ?? 0}%**`;
    },
  },
  {
    keys: ["latest incident", "last incident", "recent incident", "newest"],
    answer: (live) => {
      const inc = live.snapshot?.incidents?.[0];
      if (!inc) return "No incidents yet — run the Demo Theater or Detection Lab and one will appear here instantly.";
      return `Latest incident (live):\n• **${inc.title}** (${inc.id})\n• Camera ${inc.cameraId} · risk **${inc.riskScore}/100** · ${inc.severity}\n• Verification: **${inc.verificationStatus}**\n${inc.evidenceHash ? `• SHA-256: ${inc.evidenceHash.slice(0, 20)}…` : ""}`;
    },
  },
  {
    keys: ["system status", "status", "health", "cameras online", "who is online"],
    answer: (live) => {
      const cams = live.snapshot?.cameras ?? [];
      const online = cams.filter((c) => c.status === "online").length;
      const compromised = cams.filter((c) => c.status === "compromised").length;
      const bc = live.snapshot?.blockchain;
      return `Live system status:\n• Cameras: **${online}/${cams.length} online**${compromised ? `, ${compromised} compromised` : ""}\n• Backend: **connected via WebSocket**\n• Blockchain: **${bc?.mode === "live" ? "LIVE" : "DEMO"}** on ${bc?.network}\n• AI engine: **active** · Quorum: 3 agents`;
    },
  },
  {
    keys: ["what happened", "events", "recent activity", "feed"],
    answer: (live) => {
      const evs = live.events.slice(0, 4);
      if (!evs.length) return "The live feed is quiet right now. Trigger something — try the Demo Theater or Red Team Mode!";
      return "Latest live events:\n" + evs.map((e) => `• [${new Date(e.timestamp).toLocaleTimeString()}] ${e.message}`).join("\n");
    },
  },
];

const SUGGESTIONS = [
  "What does this website do?",
  "How does the family privacy gate work?",
  "What is the Recording Booth?",
  "How many incidents right now?",
  "Explain the 3-agent verification",
  "What is Red Team Mode?",
];

export function GuideBot() {
  const live = useLive();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      from: "bot",
      text: "Hey! I'm **Sentry**, your guide to Chain Sentry 🛡️\nAsk me anything — what the site does, how the blockchain anchoring works, or live stats like *\"how many incidents right now?\"*",
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    // pulse the bubble when a critical event arrives while closed
    const last = live.events[0];
    if (last && (last.kind === "incident_created" || last.kind === "tamper_detected") && !open) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 2500);
      return () => clearTimeout(t);
    }
  }, [live.events, open]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  const answer = (qRaw: string): string => {
    const q = qRaw.toLowerCase();
    let best: { score: number; text: string } = { score: 0, text: "" };
    for (const intent of [...LIVE_INTENTS, ...INTENTS]) {
      let score = 0;
      for (const k of intent.keys) if (q.includes(k)) score += k.length;
      if (score > best.score) best = { score, text: intent.answer(live) };
    }
    if (best.score > 0) return best.text;
    return (
      "I know everything about Chain Sentry — try asking:\n" +
      "• *\"What does this website do?\"*\n• *\"How does evidence hashing work?\"*\n• *\"How many incidents right now?\"*\n• *\"What is Red Team Mode?\"*\n• *\"Show me the latest incident\"*\n• *\"How do I run it locally?\"*"
    );
  };

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    setMsgs((m) => [...m, { from: "user", text }]);
    setInput("");
    setTyping(true);
    const reply = answer(text);
    // typewriter-ish staged reveal
    setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { from: "bot", text: reply }]);
    }, Math.min(1600, 400 + reply.length * 1.2));
  };

  return (
    <>
      {/* bubble */}
      <motion.button
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 1.2 }}
        onClick={() => setOpen(!open)}
        className={`fixed bottom-5 left-5 z-[105] h-14 w-14 rounded-2xl grid place-items-center shadow-xl transition-all ${
          pulse ? "bg-rose-600 alert-flash" : "bg-cyan-600 hover:bg-cyan-700"
        }`}
        title="Ask Sentry — project guide"
      >
        <Bot size={24} className="text-white" />
        {pulse && <span className="absolute inset-0 rounded-2xl border-2 border-rose-400 animate-ping" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="fixed bottom-24 left-5 z-[105] w-[380px] max-w-[calc(100vw-40px)] card overflow-hidden border-2 border-cyan-200"
          >
            {/* header */}
            <div className="bg-slate-950 px-4 py-3 flex items-center gap-3">
              <div className="relative h-9 w-9 rounded-xl bg-cyan-600 grid place-items-center">
                <Bot size={17} className="text-white" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-lime-400 border-2 border-slate-950 pulse-dot" />
              </div>
              <div className="flex-1">
                <div className="text-white font-extrabold text-sm">Sentry Guide</div>
                <div className="text-[10px] text-cyan-300 font-semibold flex items-center gap-1">
                  <Sparkles size={9} /> rule-based · no external AI · live data
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X size={17} /></button>
            </div>

            {/* messages */}
            <div ref={bodyRef} className="p-3.5 space-y-3 h-[340px] overflow-auto bg-cyan-50/40">
              {msgs.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                      m.from === "user"
                        ? "bg-cyan-600 text-white rounded-br-sm font-medium"
                        : "bg-white text-slate-700 border border-slate-200 rounded-bl-sm shadow-sm"
                    }`}
                  >
                    {m.text.split("**").map((chunk, j) => (j % 2 === 1 ? <strong key={j} className={m.from === "user" ? "" : "text-slate-900"}>{chunk}</strong> : chunk))}
                  </div>
                </motion.div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-2 w-2 rounded-full bg-cyan-500 pulse-dot" style={{ animationDelay: `${d * 0.18}s` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* suggestions */}
            <div className="px-3 pt-2 pb-1 bg-white flex gap-1.5 overflow-x-auto">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="chip bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100 whitespace-nowrap shrink-0">
                  {s}
                </button>
              ))}
            </div>

            {/* input */}
            <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask about hashing, MST, red team…"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-cyan-500 text-slate-900 placeholder:text-slate-400"
              />
              <button onClick={() => send()} disabled={!input.trim()}
                className="h-10 w-10 rounded-xl bg-cyan-600 grid place-items-center text-white hover:bg-cyan-700 disabled:opacity-40 transition-all active:scale-90">
                <SendHorizontal size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
