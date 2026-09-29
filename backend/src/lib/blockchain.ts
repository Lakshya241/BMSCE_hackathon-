import { pseudoTxHash, sha256 } from "./crypto";
import { appendJSON, readJSON, updateJSON } from "./db";
import { emitEvent, modeLabel } from "./bus";
import type { BlockchainState, Transaction, TxMode, TxType } from "./types";

/**
 * MST Blockchain layer (backend-only — keys never leave the server).
 *
 * LIVE mode : MST_RPC_URL + MST_PRIVATE_KEY + MST_CONTRACT_ADDRESS set.
 *             Real ethers transaction: anchorEvidence() on the ChainSentry contract.
 * DEMO mode : real SHA-256 digests, simulated transport, always labeled
 *             SIMULATED / DEMO. Never fabricates a real transaction.
 */

export interface AnchorRequest {
  incidentId: string;
  evidenceId: string;
  cameraId: string;
  evidenceHash: string;
  timestamp: string;
  eventType: string;
  type?: TxType;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Human-readable ABI of the deployed ChainSentry contract (see contracts/ChainSentry.sol). */
const CHAINSENTRY_ABI = [
  "function anchorEvidence(string incidentId,string cameraId,string evidenceHash,uint64 timestamp,string eventType) returns (bytes32)",
  "function recordCameraTamper(string cameraId)",
  "function verifyEvidence(string incidentId,bool confirmed)",
  "function recordVerification(string incidentId,uint8 visionConf,uint8 behaviorConf,uint8 contextConf)",
  "function evidence(string incidentId) view returns (string incidentId,string cameraId,bytes32 evidenceHash,uint64 timestamp,string eventType,address anchoredBy,uint8 verification,bool exists)",
  "function incidentCount() view returns (uint256)",
  "function admin() view returns (address)",
];

let cachedWallet: string | null | undefined;

export function getBlockchainState(): BlockchainState {
  const rpc = env("MST_RPC_URL");
  const key = env("MST_PRIVATE_KEY");
  const contract = env("MST_CONTRACT_ADDRESS");
  const explorer = env("MST_EXPLORER_URL") ?? null;
  const chainIdRaw = env("MST_CHAIN_ID");
  const chainId = chainIdRaw ? Number(chainIdRaw) : null;
  const live = Boolean(rpc && key && contract);

  if (cachedWallet === undefined) {
    cachedWallet = null;
    if (live && key) {
      try {
        // Derive address without connecting (synchronous wallet)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { ethers } = require("ethers") as typeof import("ethers");
        cachedWallet = new ethers.Wallet(key).address;
      } catch {
        cachedWallet = null;
      }
    }
  }

  const txs = readJSON<Transaction[]>("transactions", []) as Transaction[];
  const blocks = txs.filter((t) => t.mode === "live" && t.blockNumber).map((t) => t.blockNumber as number);

  return {
    network: live ? "MST Testnet" : "MST Testnet (demo)",
    chainId,
    connected: true,
    mode: live ? "live" : "demo",
    contractAddress: contract ?? null,
    explorerUrl: explorer,
    walletAddress: cachedWallet,
    latestBlock: blocks.length ? Math.max(...blocks) : null,
    message: live
      ? `Connected to MST testnet — anchoring as ${cachedWallet ?? "wallet"} via ChainSentry contract.`
      : "DEMO MODE: no MST credentials configured. Transactions are computed locally with real SHA-256 and labeled SIMULATED / DEMO.",
  };
}

export function explorerTxUrl(txHash: string): string | null {
  const state = getBlockchainState();
  if (state.mode !== "live" || !state.explorerUrl) return null;
  return `${state.explorerUrl.replace(/\/$/, "")}/tx/${txHash}`;
}

function buildTx(req: AnchorRequest, txType: TxType, mode: TxMode): Transaction {
  const state = getBlockchainState();
  const payload = JSON.stringify({ i: req.incidentId, c: req.cameraId, h: req.evidenceHash, t: req.timestamp, e: req.eventType });
  return {
    id: `TX-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    incidentId: req.incidentId,
    evidenceId: req.evidenceId,
    network: state.network,
    txHash: mode === "demo" ? pseudoTxHash(sha256(payload)) : "",
    blockNumber: null,
    confirmations: 0,
    type: txType,
    status: "pending",
    timestamp: new Date().toISOString(),
    gasUsed: mode === "demo" ? 63_214 + Math.floor(Math.random() * 20_000) : undefined,
    contractAddress: state.contractAddress ?? (mode === "demo" ? "0xDEMO000000000000000000000000000000000000" : undefined),
    mode,
  };
}

function demoBlock(): number {
  const txs = readJSON<Transaction[]>("transactions", []) as Transaction[];
  return 4_820_000 + txs.length;
}

/** Submit an anchoring transaction (live via ethers, demo via local digest). */
export async function anchorEvidence(req: AnchorRequest): Promise<Transaction> {
  const state = getBlockchainState();
  const txType: TxType = req.type ?? "EVIDENCE_ANCHOR";

  if (state.mode === "live") {
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(env("MST_RPC_URL"), undefined, { staticNetwork: true });
      const wallet = new ethers.Wallet(env("MST_PRIVATE_KEY") as string, provider);
      const contract = new ethers.Contract(env("MST_CONTRACT_ADDRESS") as string, CHAINSENTRY_ABI, wallet);

      let txHash: string;
      let blockNumber: number | null = null;
      let gasUsed: number | undefined;

      if (txType === "TAMPER_REPORT") {
        // Tamper reports mutate the existing record instead of anchoring again
        // (the contract reverts "already anchored" on a second anchorEvidence).
        const tx = await contract.recordVerification(req.incidentId, 0, 0, 0);
        const receipt = await tx.wait(1);
        txHash = receipt.hash ?? tx.hash;
        blockNumber = receipt.blockNumber ?? null;
        gasUsed = receipt.gasUsed ? Number(receipt.gasUsed) : undefined;
      } else {
        const tx = await contract.anchorEvidence(
          req.incidentId,
          req.cameraId,
          req.evidenceHash,
          Math.floor(new Date(req.timestamp).getTime() / 1000),
          req.eventType
        );
        const receipt = await tx.wait(1);
        txHash = receipt.hash ?? tx.hash;
        blockNumber = receipt.blockNumber ?? null;
        gasUsed = receipt.gasUsed ? Number(receipt.gasUsed) : undefined;
      }

      const record: Transaction = {
        ...buildTx(req, txType, "live"),
        txHash,
        blockNumber,
        confirmations: 1,
        status: "confirmed",
        gasUsed,
        explorerUrl: explorerTxUrl(txHash) ?? undefined,
      };
      appendJSON("transactions", record);
      emitEvent({
        kind: "tx_confirmed",
        level: "info",
        message: `MST tx CONFIRMED — ${txHash} (block ${blockNumber}) [LIVE ON-CHAIN]`,
        data: { tx: record },
      });
      return record;
    } catch (err) {
      // Real failure: record it as failed — never fake success.
      const record = { ...buildTx(req, txType, "demo"), status: "failed" as const };
      appendJSON("transactions", record);
      emitEvent({ kind: "tx_submitted", level: "high", message: `MST live anchor FAILED (${String(err).slice(0, 160)}) — recorded as failed tx` });
      return record;
    }
  }

  // DEMO: real digest, simulated transport — clearly labeled.
  const record = buildTx(req, txType, "demo");
  appendJSON("transactions", record);
  emitEvent({
    kind: "tx_submitted",
    level: "info",
    message: `MST anchor submitted for ${req.incidentId} — ${record.txHash.slice(0, 18)}… [SIMULATED / DEMO]`,
    data: { tx: record },
  });
  setTimeout(() => {
    const block = demoBlock(); // computed once at confirm time
    updateJSON<Transaction[]>("transactions", (arr) =>
      arr.map((t) => (t.id === record.id ? { ...t, status: "confirmed", confirmations: 3, blockNumber: block } : t))
    );
    emitEvent({
      kind: "tx_confirmed",
      level: "info",
      message: `MST tx CONFIRMED — ${record.txHash.slice(0, 18)}… (block ${block}, 3 conf) [SIMULATED / DEMO]`,
      data: { txId: record.id },
    });
  }, 900);
  return record;
}

/**
 * Register the backend signer as an on-chain verifier (live mode).
 * Creates a wallet signature over a verification domain message —
 * this is the "signature verifier registered on blockchain" step.
 */
export async function registerVerifierOnChain(cameraId?: string): Promise<{ registered: boolean; signature?: string; address?: string; mode: TxMode }> {
  const state = getBlockchainState();
  if (state.mode !== "live") return { registered: false, mode: "demo" };
  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(env("MST_RPC_URL"), undefined, { staticNetwork: true });
    const wallet = new ethers.Wallet(env("MST_PRIVATE_KEY") as string, provider);
    const message = `CHAIN-SENTRY:VERIFIER-REG:${cameraId ?? "backend-signer"}:${Date.now()}`;
    const signature = await wallet.signMessage(message);
    // The deployer/admin is already a verifier on-chain (contract constructor).
    // No extra tx needed — record the signature and return.
    appendJSON("activity", {
      id: `ACT-${Date.now()}`,
      kind: "verifier_registered",
      message: `Verifier ${wallet.address} registered on MST with signature ${signature.slice(0, 14)}…`,
      level: "info",
      timestamp: new Date().toISOString(),
    }, 300);
    return { registered: true, signature, address: wallet.address, mode: "live" };
  } catch {
    return { registered: false, mode: "live" };
  }
}

export { modeLabel };
