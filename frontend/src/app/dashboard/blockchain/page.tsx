"use client";

import { ExternalLink, Link2, FileCode2 } from "lucide-react";
import { useDashboard } from "@/components/DashboardProvider";
import { ModeBadge, StatusDot, shortHash } from "@/components/ui";

export default function BlockchainPage() {
  const { state } = useDashboard();
  const bc = state.blockchain;
  const txs = state.transactions;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">MST Blockchain</h1>
        <p className="text-sm text-slate-500">Evidence anchoring layer — backend-signed hashes on-chain, video never leaves the vault.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-5 md:col-span-2">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 grid place-items-center"><Link2 size={15} className="text-white" /></div>
            <h2 className="font-extrabold text-slate-900">{bc?.network}</h2>
            <ModeBadge mode={bc?.mode ?? "demo"} />
            {bc?.walletAddress && <span className="mono text-[10px] text-slate-400">signer {shortHash(bc.walletAddress, 8)}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Kv k="chain id" v={bc?.chainId != null ? String(bc.chainId) : "—"} />
            <Kv k="contract" v={bc?.contractAddress ? shortHash(bc.contractAddress, 12) : "not deployed"} />
            <Kv k="latest block" v={bc?.latestBlock != null ? String(bc.latestBlock) : "—"} />
            <Kv k="anchored proofs" v={String(txs.filter((t) => t.type === "EVIDENCE_ANCHOR").length)} />
          </div>
          <p className="mt-3 text-xs text-slate-500 leading-relaxed">{bc?.message}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-lime-600 grid place-items-center"><FileCode2 size={15} className="text-white" /></div>
            <h2 className="font-extrabold text-sm text-slate-900">ChainSentry.sol</h2>
          </div>
          <ul className="text-xs text-slate-600 space-y-1.5 mono">
            {["registerCamera()", "registerVerifier()", "createIncident()", "anchorEvidence()", "verifyEvidence()", "recordVerification()", "updateIncidentStatus()", "recordCameraTamper()", "createSecurityBounty()"].map((f) => (
              <li key={f} className="flex items-center gap-2"><span className="text-lime-600">ƒ</span> {f}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 text-sm font-extrabold uppercase tracking-[0.18em] text-slate-500">Transactions</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Tx hash</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Incident</th>
                <th className="px-5 py-3">Block</th><th className="px-5 py-3">Conf</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Mode</th><th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-cyan-50/60">
                  <td className="px-5 py-3 mono text-xs text-indigo-600">{shortHash(t.txHash, 12)}</td>
                  <td className="px-5 py-3 text-xs text-slate-600">{t.type}</td>
                  <td className="px-5 py-3 text-xs text-slate-500 mono">{t.incidentId ?? "—"}</td>
                  <td className="px-5 py-3 mono text-xs text-slate-600">{t.blockNumber ?? "pending"}</td>
                  <td className="px-5 py-3 mono text-xs text-slate-600">{t.confirmations}</td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5 text-xs"><StatusDot status={t.status} /> {t.status}</span>
                  </td>
                  <td className="px-5 py-3"><ModeBadge mode={t.mode} /></td>
                  <td className="px-5 py-3">
                    {t.mode === "live" && t.explorerUrl ? (
                      <a href={t.explorerUrl} target="_blank" rel="noreferrer" className="text-cyan-700 font-bold hover:underline inline-flex items-center gap-1 text-xs">
                        MSTScan <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-400">demo — no explorer</span>
                    )}
                  </td>
                </tr>
              ))}
              {txs.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">No transactions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Demo transactions are cryptographically derived (real SHA-256) but never broadcast — always labeled SIMULATED / DEMO.
        Configure <span className="mono text-slate-700">MST_RPC_URL</span>, <span className="mono text-slate-700">MST_PRIVATE_KEY</span> and{" "}
        <span className="mono text-slate-700">MST_CONTRACT_ADDRESS</span> in <span className="mono text-slate-700">backend/.env</span> to anchor for real.
      </p>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{k}</div>
      <div className="mono text-slate-800 text-[13px] font-bold">{v}</div>
    </div>
  );
}
