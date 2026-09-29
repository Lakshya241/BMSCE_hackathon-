import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA = path.join(process.cwd(), "data");
fs.mkdirSync(DATA, { recursive: true });

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const now = Date.now();
const iso = (offsetMin = 0) => new Date(now - offsetMin * 60_000).toISOString();
const write = (name, data) => fs.writeFileSync(path.join(DATA, `${name}.json`), JSON.stringify(data, null, 2));

// ---------------- cameras ----------------
const cameras = [
  { id: "CAM-001", name: "Main Entrance", location: "Building A · Ground", status: "online", mode: "armed", riskLevel: "medium", lastSeen: iso(0), uptime: 99.4, tamperCount: 0, latencyMs: 42, model: "Sentry-Cam X2" },
  { id: "CAM-002", name: "Server Room", location: "Building A · B1", status: "online", mode: "armed", riskLevel: "high", lastSeen: iso(1), uptime: 99.8, tamperCount: 0, latencyMs: 38, model: "Sentry-Cam X2" },
  { id: "CAM-003", name: "Parking Deck L2", location: "Building B · L2", status: "online", mode: "armed", riskLevel: "medium", lastSeen: iso(0), uptime: 98.9, tamperCount: 1, latencyMs: 55, model: "Sentry-Cam X2" },
  { id: "CAM-004", name: "Loading Dock", location: "Building B · Dock", status: "online", mode: "disarmed", riskLevel: "low", lastSeen: iso(2), uptime: 97.6, tamperCount: 0, latencyMs: 61, model: "Sentry-Dome D1" },
  { id: "CAM-005", name: "Corridor East", location: "Building A · F3", status: "degraded", mode: "armed", riskLevel: "low", lastSeen: iso(6), uptime: 94.1, tamperCount: 0, latencyMs: 130, model: "Sentry-Dome D1" },
];
write("cameras", cameras);

// ---------------- nodes ----------------
const nodes = [
  { id: "NODE-01", name: "Alpha Validator", region: "us-east", role: "validator", status: "active", stake: 52000, uptime: 99.95, lastBlock: 4820341, latencyMs: 22 },
  { id: "NODE-02", name: "Beta Verifier", region: "eu-west", role: "verifier", status: "active", stake: 31000, uptime: 99.9, lastBlock: 4820340, latencyMs: 47 },
  { id: "NODE-03", name: "Gamma Storage", region: "ap-south", role: "storage", status: "active", stake: 18500, uptime: 99.7, lastBlock: 4820339, latencyMs: 88 },
  { id: "NODE-04", name: "Delta Gateway", region: "us-west", role: "gateway", status: "active", stake: 12000, uptime: 99.6, lastBlock: 4820341, latencyMs: 35 },
  { id: "NODE-05", name: "Epsilon Verifier", region: "eu-north", role: "verifier", status: "syncing", stake: 9800, uptime: 98.2, lastBlock: 4820288, latencyMs: 71 },
  { id: "NODE-06", name: "Zeta Validator", region: "sa-east", role: "validator", status: "active", stake: 27400, uptime: 99.88, lastBlock: 4820341, latencyMs: 64 },
];
write("nodes", nodes);

// ---------------- users / settings ----------------
write("users", [
  { id: "USR-001", name: "Security Admin", role: "admin", wallet: null, createdAt: iso(60 * 24 * 30) },
  { id: "USR-002", name: "Night Operator", role: "operator", wallet: null, createdAt: iso(60 * 24 * 12) },
]);

write("settings", {
  armed: true,
  demoMode: true,
  mstNetwork: "MST Testnet",
  motionSensitivity: 65,
  riskThreshold: 55,
  restrictedZones: { "CAM-002": { x: 0.55, y: 0.25, w: 0.4, h: 0.55 } },
  tripwires: { "CAM-001": { x1: 0.2, y1: 0.9, x2: 0.8, y2: 0.55 } },
  privacyMaskDefault: false,
  autoAnchor: true,
  quorumAgents: 3,
  updatedAt: iso(0),
});

write("analytics", { incidentsByType: [], riskDistribution: [], daily: [], verificationRate: 0, avgRisk: 0 });

// ---------------- historic incidents + evidence + txs + verifications ----------------
const incidentSeeds = [
  { id: "INC-1001", cam: "CAM-001", type: "restricted_entry", title: "Person entered restricted zone", severity: "high", risk: 91, min: 95, zone: "vault", frames: 18 },
  { id: "INC-1002", cam: "CAM-003", type: "loitering", title: "Loitering near stairwell exit", severity: "medium", risk: 58, min: 240, zone: null, frames: 12 },
  { id: "INC-1003", cam: "CAM-002", type: "motion", title: "Motion burst after hours", severity: "low", risk: 34, min: 420, zone: null, frames: 8, status: "false_alarm" },
  { id: "INC-1004", cam: "CAM-003", type: "person_detected", title: "Person detected in vehicle aisle", severity: "medium", risk: 61, min: 610, zone: null, frames: 14 },
];

const incidents = [];
const evidence = [];
const transactions = [];
const verifications = [];
const alerts = [];
const activity = [];

for (const s of incidentSeeds) {
  const ts = iso(s.min);
  const payload = JSON.stringify({ id: s.id, cam: s.cam, type: s.type, ts, frames: s.frames, risk: s.risk });
  const hash = sha(payload);
  const txHash = "0x" + sha(`seed-tx:${s.id}`);
  const verified = s.type !== "motion";

  incidents.push({
    id: s.id, cameraId: s.cam, type: s.type, title: s.title, severity: s.severity, riskScore: s.risk,
    timestamp: ts, evidenceHash: hash, blockchainTx: txHash, txMode: "demo",
    verificationStatus: verified ? "verified" : "rejected", status: s.status ?? "resolved",
    description: `${s.type.replace(/_/g, " ")} on ${s.cam}${s.zone ? ` in restricted zone "${s.zone}"` : ""} — risk ${s.risk}/100.`,
    frames: s.frames, source: "simulated", zone: s.zone,
  });

  evidence.push({
    id: `EVD-${s.id.slice(-4)}`, incidentId: s.id, originalHash: hash, currentHash: hash,
    storageReference: `cs://evidence/${s.id}/packet.bin`, createdAt: ts, tampered: false,
    chainStatus: "confirmed", frameCount: s.frames, algorithm: "SHA-256", sizeBytes: payload.length,
  });

  transactions.push({
    id: `TX-${s.id.slice(-4)}`, incidentId: s.id, evidenceId: `EVD-${s.id.slice(-4)}`, network: "MST Testnet",
    txHash, blockNumber: 4820000 + Math.floor(Math.random() * 300), confirmations: 12, type: "EVIDENCE_ANCHOR",
    status: "confirmed", timestamp: ts, gasUsed: 63214 + Math.floor(Math.random() * 20000),
    contractAddress: "0xDEMO000000000000000000000000000000000000", mode: "demo",
  });

  verifications.push({
    id: `VER-${s.id.slice(-4)}`, incidentId: s.id,
    agents: [
      { name: "Vision Agent", result: verified ? "confirmed" : "rejected", confidence: 0.94, rationale: `Frame packet (${s.frames}f) visually consistent with ${s.type.replace(/_/g, " ")}.` },
      { name: "Behavior Agent", result: "confirmed", confidence: 0.91, rationale: `Trajectory matches a ${s.severity}-risk ${s.type.replace(/_/g, " ")} signature.` },
      { name: "Context Agent", result: s.zone ? "confirmed" : "abstained", confidence: s.zone ? 0.94 : 0.62, rationale: s.zone ? `Event localized to restricted zone "${s.zone}".` : "No zone context attached; agent abstains." },
    ],
    consensus: verified ? "confirmed" : "rejected", confidence: 0.93, startedAt: ts, completedAt: ts, quorum: verified ? "3/3" : "2/3",
  });

  if (verified) {
    alerts.push({
      id: `ALR-${s.id.slice(-4)}`, incidentId: s.id, title: `${s.severity.toUpperCase()}: ${s.title}`,
      message: `${s.type.replace(/_/g, " ")} on ${s.cam} — risk ${s.risk}/100. Evidence anchored.`,
      severity: s.severity, acknowledged: s.min > 300, createdAt: ts, channel: "dashboard",
    });
  }
  activity.push(
    { id: `ACT-${s.id.slice(-4)}a`, kind: "incident_created", message: `${s.id} · ${s.type} · ${s.cam} · risk ${s.risk}`, level: s.severity, timestamp: ts },
    { id: `ACT-${s.id.slice(-4)}b`, kind: "anchored", message: `Evidence for ${s.id} anchored on MST Testnet (demo)`, level: "info", timestamp: ts }
  );
}

write("incidents", incidents);
write("evidence", evidence);
write("transactions", transactions);
write("verifications", verifications);
write("alerts", alerts);
write("activity", activity);

console.log("Seeded:", ["cameras", "nodes", "users", "settings", "analytics", "incidents", "evidence", "transactions", "verifications", "alerts", "activity"].join(", "));
