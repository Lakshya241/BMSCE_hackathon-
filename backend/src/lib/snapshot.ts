import { buildAnalytics, networkStats } from "./analytics";
import { getBlockchainState } from "./blockchain";
import { readJSON } from "./db";
import { listFamily } from "./family";
import { listCaptures, captureStats } from "./captures";
import type {
  ActivityEvent, Alert, Analytics, BlockchainState, Camera, Capture, CaptureStats, ChainNode, Evidence, FamilyMember, Incident, Settings, Transaction, Verification, WsSnapshot,
} from "./types";

export function buildSnapshot(): WsSnapshot {
  return {
    type: "snapshot",
    cameras: readJSON<Camera[]>("cameras", []) as Camera[],
    incidents: readJSON<Incident[]>("incidents", []) as Incident[],
    alerts: readJSON<Alert[]>("alerts", []) as Alert[],
    evidence: readJSON<Evidence[]>("evidence", []) as Evidence[],
    transactions: readJSON<Transaction[]>("transactions", []) as Transaction[],
    nodes: readJSON<ChainNode[]>("nodes", []) as ChainNode[],
    verifications: readJSON<Verification[]>("verifications", []) as Verification[],
    activity: readJSON<ActivityEvent[]>("activity", []) as ActivityEvent[],
    family: listFamily() as unknown as FamilyMember[],
    captures: listCaptures(20) as unknown as Capture[],
    captureStats: captureStats() as unknown as CaptureStats,
    settings: readJSON<Settings>("settings", {} as Settings) as Settings,
    blockchain: getBlockchainState(),
    analytics: buildAnalytics(),
    stats: networkStats(),
    serverTime: new Date().toISOString(),
  };
}

export function emptyAnalytics(): Analytics {
  return { incidentsByType: [], riskDistribution: [], daily: [], verificationRate: 0, avgRisk: 0 };
}

export function emptyBlockchain(): BlockchainState {
  return {
    network: "MST Testnet (demo)", chainId: null, connected: false, mode: "demo",
    contractAddress: null, explorerUrl: null, walletAddress: null, latestBlock: null, message: "",
  };
}
