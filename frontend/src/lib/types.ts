export type Severity = "low" | "medium" | "high" | "critical";
export type TxMode = "demo" | "live";

export interface Camera {
  id: string;
  name: string;
  location: string;
  status: "online" | "offline" | "compromised" | "degraded";
  mode: "armed" | "disarmed";
  riskLevel: Severity;
  lastSeen: string;
  uptime: number;
  tamperCount: number;
  latencyMs: number;
  model: string;
  wallet?: string | null;
}

export interface Incident {
  id: string;
  cameraId: string;
  type: string;
  title: string;
  severity: Severity;
  riskScore: number;
  timestamp: string;
  evidenceHash?: string;
  blockchainTx?: string;
  txMode?: TxMode;
  verificationStatus: "pending" | "verified" | "rejected" | "inconclusive";
  status: "active" | "investigating" | "resolved" | "false_alarm";
  description: string;
  frames?: number;
  source?: "simulated" | "webcam" | "video" | "sensor";
  zone?: string | null;
}

export interface Evidence {
  id: string;
  incidentId: string;
  originalHash: string;
  currentHash: string;
  storageReference: string;
  createdAt: string;
  tampered: boolean;
  tamperedAt?: string;
  tamperMethod?: string;
  chainStatus: "pending" | "anchored" | "confirmed" | "failed";
  frameCount?: number;
  algorithm: "SHA-256";
  sizeBytes: number;
}

export interface Transaction {
  id: string;
  incidentId?: string;
  evidenceId?: string;
  network: string;
  txHash: string;
  blockNumber: number | null;
  confirmations: number;
  type: string;
  status: "pending" | "confirmed" | "failed";
  timestamp: string;
  gasUsed?: number;
  explorerUrl?: string;
  contractAddress?: string;
  mode: TxMode;
}

export interface AgentResult {
  name: string;
  result: "confirmed" | "rejected" | "abstained";
  confidence: number;
  rationale: string;
}

export interface Verification {
  id: string;
  incidentId: string;
  agents: AgentResult[];
  consensus: "confirmed" | "rejected" | "pending";
  confidence: number;
  startedAt: string;
  completedAt?: string;
  quorum: string;
}

export interface Alert {
  id: string;
  incidentId?: string;
  title: string;
  message: string;
  severity: Severity;
  acknowledged: boolean;
  createdAt: string;
  channel: string;
}

export interface ChainNode {
  id: string;
  name: string;
  region: string;
  role: "validator" | "verifier" | "storage" | "gateway";
  status: "active" | "syncing" | "offline";
  stake: number;
  uptime: number;
  lastBlock?: number;
  latencyMs: number;
}

export interface ActivityEvent {
  id: string;
  kind: string;
  message: string;
  level: Severity | "info";
  timestamp: string;
}

export interface Settings {
  armed: boolean;
  demoMode: boolean;
  mstNetwork: string;
  motionSensitivity: number;
  riskThreshold: number;
  privacyMaskDefault: boolean;
  autoAnchor: boolean;
  quorumAgents: number;
  updatedAt: string;
}

export interface Analytics {
  incidentsByType: { type: string; count: number }[];
  riskDistribution: { name: string; value: number }[];
  daily: { day: string; incidents: number; high: number; verified: number; tampers: number }[];
  verificationRate: number;
  avgRisk: number;
}

export interface BlockchainState {
  network: string;
  chainId: number | null;
  connected: boolean;
  mode: TxMode;
  contractAddress: string | null;
  explorerUrl: string | null;
  walletAddress: string | null;
  latestBlock: number | null;
  message: string;
}

export interface LiveEvent {
  kind: string;
  level: Severity | "info";
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  photo: string;
  photoHash: string;
  createdAt: string;
}

export interface CaptureFace {
  box: { x: number; y: number; w: number; h: number };
  family: boolean;
  match: { id: string; name: string; relation: string; similarity: number } | null;
}

export type AreaMode = "family" | "restricted" | "public";

export interface Capture {
  id: string;
  cameraId: string;
  mode: AreaMode;
  at: string;
  image: string;
  digest: string;
  prevDigest: string | null;
  motion: boolean;
  persons: number;
  faces: CaptureFace[];
  strangers: number;
  familyCount: number;
  intrusion: boolean;
  storedReason: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface CaptureStats {
  total: number;
  kept: number;
  skippedPrivate: number;
  intrusions: number;
  lastAt: string | null;
}

export interface Stats {
  totalIncidents: number;
  activeIncidents: number;
  verified: number;
  tampered: number;
  totalTx: number;
  confirmedTx: number;
}

export interface Snapshot {
  cameras: Camera[];
  incidents: Incident[];
  alerts: Alert[];
  evidence: Evidence[];
  transactions: Transaction[];
  nodes: ChainNode[];
  verifications: Verification[];
  activity: ActivityEvent[];
  family: FamilyMember[];
  captures: Capture[];
  captureStats: CaptureStats;
  settings: Settings;
  blockchain: BlockchainState;
  analytics: Analytics;
  stats: Stats;
  serverTime: string;
}
